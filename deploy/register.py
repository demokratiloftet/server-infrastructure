#!/usr/bin/env python3
"""One-time operator registration. Subsequent main pushes deploy through Actions."""
import argparse
import json
from pathlib import Path
import shlex
import subprocess
import tempfile
from sandbox import app_name, DOMAIN


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repo', type=app_name, help='Reviewed repository in demokratiloftet; also the app subdomain')
    parser.add_argument('--host', default='187.124.129.149')
    parser.add_argument('--identity', required=True, type=Path, help='Operator SSH key; never uploaded to GitHub')
    parser.add_argument('--known-hosts', type=Path, default=Path.home() / '.ssh/known_hosts')
    args = parser.parse_args()
    repo = 'demokratiloftet/' + args.repo
    metadata = json.loads(output('gh', 'repo', 'view', repo, '--json', 'nameWithOwner,defaultBranchRef'))
    if metadata['nameWithOwner'] != repo:
        raise ValueError('Unexpected repository owner/name')
    branch = metadata['defaultBranchRef']['name']
    if branch != 'main':
        raise ValueError('The starter workflow currently requires main as default branch')
    host_keys = output('ssh-keygen', '-F', args.host, '-f', str(args.known_hosts))
    if not host_keys:
        raise ValueError('Verify and save the SSH host key before registration')
    ssh_options = ['-i', str(args.identity.expanduser()), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
                   '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={args.known_hosts}', '-o', 'ConnectTimeout=15']
    ssh = ['ssh', *ssh_options, 'root@' + args.host]
    # Strict host-key checking happens before source or trigger credentials are sent.
    remote = output(*ssh, 'mktemp -d /root/loftet-registration.XXXXXXXX')
    with tempfile.TemporaryDirectory(prefix='loftet-register-') as temporary:
        local = Path(temporary)
        try:
            run('gh', 'repo', 'clone', repo, str(local / 'source'), '--', '--single-branch', '--branch', branch)
            sha = output('git', '-C', str(local / 'source'), 'rev-parse', 'HEAD')
            run('git', '-C', str(local / 'source'), 'bundle', 'create', str(local / 'source.bundle'), branch)
            run('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'sandbox-' + args.repo, '-f', str(local / 'trigger'))
            files = [local / 'source.bundle', local / 'trigger.pub']
            files += [Path(__file__).with_name(name) for name in ['register-vps.py', 'sandbox.py', 'gateway.mjs']]
            run('scp', *ssh_options, *map(str, files), 'root@' + args.host + ':' + remote + '/')
            command = ['python3', remote + '/register-vps.py', args.repo, branch, sha, remote]
            run(*ssh, shlex.join(command))
            # No operator key, PAT, PDS password or VPS environment is sent to Actions.
            run('gh', 'secret', 'set', 'DEMO_DEPLOY_SSH_KEY', '--repo', repo, input=(local / 'trigger').read_text(), text=True)
            run('gh', 'secret', 'set', 'DEMO_DEPLOY_KNOWN_HOSTS', '--repo', repo, input=host_keys + '\n', text=True)
            run('gh', 'variable', 'set', 'DEMO_DEPLOY_HOST', '--repo', repo, '--body', args.host)
            run('gh', 'variable', 'set', 'DEMO_DEPLOY_ENABLED', '--repo', repo, '--body', 'true')
            run('gh', 'workflow', 'run', 'check.yml', '--repo', repo, '--ref', branch)
        finally:
            run(*ssh, shlex.join(['rm', '-rf', '--', remote]))
    print(f'Private app: https://{args.repo}.{DOMAIN}')
    print(f'Check deployment result: gh run list --repo {repo}')


if __name__ == '__main__':
    main()
