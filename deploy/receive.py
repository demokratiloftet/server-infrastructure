#!/usr/bin/env python3
"""Root-owned, forced-command receiver. Install outside any deployment checkout."""
import base64
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile

BASE = Path('/var/lib/loftet-deploy')
TARGETS = {
    'loftet-social': ('main', 'loftet-social', 'Dockerfile'),
    'calendar-app': ('master', 'public-calendar', 'Dockerfile.public'),
    'organisation-verifier': ('main', 'app', 'Dockerfile'),
}


def requested_sha(command):
    match = re.fullmatch(r'deploy ([0-9a-f]{40})', command)
    if not match:
        raise ValueError('Only deploy followed by a full commit SHA is allowed')
    return match[1]


def read_token(stream):
    # GitHub's token format is opaque. Validate transport bounds, not a guessed prefix.
    token = stream.readline(8194).rstrip('\n')
    if not re.fullmatch(r'[!-~]{1,8192}', token):
        raise ValueError('A short-lived GitHub Actions read token is required')
    return token


def requires_operator_review(paths):
    protected = ('deploy/', 'infra/', 'compose', 'server/db.mjs', 'src/store.ts', 'fixture/', 'vendor/')
    return any(p.startswith(protected) and not p.endswith('.md') for p in paths)


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def capture(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in TARGETS:
        raise ValueError('Unknown deployment target')
    repo = sys.argv[1]
    sha = requested_sha(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    branch, service, dockerfile = TARGETS[repo]
    root = BASE / repo
    source = root / 'source'
    # All apps share one VPS: serialize builds and cutovers across repositories.
    with (BASE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        git = ('git', '-C', str(source))
        # The organisation disables deploy keys. Use only this workflow's
        # short-lived, repository-scoped contents:read token, received over SSH.
        token = read_token(sys.stdin)
        fetch_env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0',
                     'GIT_CONFIG_COUNT': '2',
                     'GIT_CONFIG_KEY_0': 'http.https://github.com/.extraheader',
                     'GIT_CONFIG_VALUE_0': 'AUTHORIZATION: basic ' + base64.b64encode(('x-access-token:' + token).encode()).decode(),
                     'GIT_CONFIG_KEY_1': 'credential.helper', 'GIT_CONFIG_VALUE_1': ''}
        try:
            run(*git, 'fetch', '--no-tags', 'origin', branch, env=fetch_env)
        finally:
            fetch_env.clear()
            token = ''

        head = capture(*git, 'rev-parse', 'FETCH_HEAD')
        if head != sha:
            raise ValueError('Only the current default-branch head may deploy; rerun CI for the new head')
        previous_file = root / 'current.json'
        if not previous_file.exists():
            raise ValueError('An operator must establish the reviewed initial baseline first')
        previous = json.loads(previous_file.read_text())
        # Runtime topology, gateways and DB schemas need a reviewed operator rollout.
        changed = capture(*git, 'diff', '--name-only', previous['sha'], sha).splitlines()
        if requires_operator_review(changed):
            raise ValueError('Topology, deployment or schema changed: operator review and rollout required')
        release = root / 'releases' / sha
        release.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile() as archive:
            run(*git, 'archive', '--format=tar', sha, stdout=archive)
            archive.seek(0)
            with tarfile.open(fileobj=archive) as tar:
                tar.extractall(release, filter='data')
        image = f'loftet-deploy/{repo}:{sha}'
        # Build from source only, before any live environment files are involved.
        run('docker', 'build', '--tag', image, '--file', str(release / dockerfile), str(release))
        override = root / 'image.json'
        override.write_text(json.dumps({'services': {service: {'image': image}}}))
        if repo == 'organisation-verifier':
            compose = ['docker', 'compose', '-p', 'organisation-verifier', '--project-directory', '/root/organisation-verifier',
                       '-f', '/root/organisation-verifier/compose.yaml', '-f', str(override)]
        else:
            compose = ['/root/loftet-social/deploy/compose.sh', '-f', str(override)]
        run(*compose, 'config', '--quiet')
        # Keep the old image and do not remove volumes, migrate a PDS, or restart dependencies.
        try:
            run(*compose, 'up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '90', service)
            if repo != 'organisation-verifier':
                host = 'demo-social' if repo == 'loftet-social' else 'demo-calendar'
                run('curl', '--fail', '--silent', '--show-error', '--max-time', '20',
                    f'https://{host}.dev.demokratiloftet.no/', stdout=subprocess.DEVNULL)
        except (subprocess.CalledProcessError, OSError):
            override.write_text(json.dumps({'services': {service: {'image': previous['image']}}}))
            run(*compose, 'up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '90', service)
            raise
        record = {'sha': sha, 'image': image, 'previous': previous['image']}
        pending = root / 'current.next'
        pending.write_text(json.dumps(record) + '\n')
        pending.replace(previous_file)
        print(f'Deployed {repo} {sha}; previous image retained as {previous["image"]}')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Neither resolved Compose nor environment/credentials belong in CI logs.
        print(f'Deployment failed: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
