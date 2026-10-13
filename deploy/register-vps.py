#!/usr/bin/env python3
"""Called by register.py with an operator SSH key, never by a participant trigger."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tarfile
from sandbox import app_name, topology, DOMAIN


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def available_port():
    used = {json.loads(p.read_text())['port'] for p in Path('/etc/loftet-deploy/apps').glob('*/target.json')}
    for port in range(3210, 3300):
        if port in used:
            continue
        with socket.socket() as sock:
            try:
                sock.bind(('127.0.0.1', port))
                return port
            except OSError:
                pass
    raise ValueError('No free sandbox port')


def main():
    if os.geteuid() != 0:
        raise ValueError('Operator/root required')
    name, branch, sha, payload = sys.argv[1:]
    app_name(name)
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_/-]*', branch) or not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('Invalid branch or revision')
    payload = Path(payload)
    public_key = (payload / 'trigger.pub').read_text().strip()
    if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+ [a-z0-9-]+', public_key):
        raise ValueError('Invalid trigger key')
    base = Path('/var/lib/loftet-deploy')
    config = Path('/etc/loftet-deploy/apps') / name
    root = base / name
    os.umask(0o077)
    base.mkdir(parents=True, exist_ok=True)
    config.parent.mkdir(parents=True, exist_ok=True)
    with (base / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if config.exists() or root.exists():
            raise ValueError('Already registered or incomplete bootstrap; operator must inspect before retry')
        if len(list(config.parent.glob('*/target.json'))) >= 10:
            raise ValueError('Ten-app capacity limit reached; review VPS resources before raising it')
        port = available_port()
        config.mkdir()
        root.mkdir()
        (config / 'target.json').write_text(json.dumps({'branch': branch, 'port': port}) + '\n')
        (config / 'compose.yaml').write_text(json.dumps(topology(name, port), indent=2) + '\n')
        shutil.copyfile(Path(__file__).with_name('gateway.mjs'), config / 'gateway.mjs')
        (config / 'gateway.mjs').chmod(0o644)
        source = root / 'source'
        run('git', 'init', '--bare', str(source))
        run('git', '-C', str(source), 'fetch', str(payload / 'source.bundle'), branch)
        actual = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'FETCH_HEAD'], text=True).strip()
        if actual != sha:
            raise ValueError('Source bundle revision mismatch')
        run('git', '-C', str(source), 'remote', 'add', 'origin', f'https://github.com/demokratiloftet/{name}.git')
        release = root / 'releases' / sha
        release.mkdir(parents=True)
        archive = payload / 'source.tar'
        with archive.open('wb') as out:
            run('git', '-C', str(source), 'archive', sha, stdout=out)
        with tarfile.open(archive) as tar:
            tar.extractall(release, filter='data')
        image = f'loftet-deploy/{name}:{sha}'
        run('docker', 'build', '--build-arg', f'APP_REVISION={sha}', '-t', image, str(release), timeout=900)
        (root / 'image.json').write_text(json.dumps({'services': {'app': {'image': image}}}))
        compose = ['docker', 'compose', '-p', 'protospace-' + name, '--project-directory', str(config),
                   '-f', str(config / 'compose.yaml'), '-f', str(root / 'image.json')]
        try:
            run(*compose, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '90')
            run('curl', '-fsS', '--max-time', '20', f'http://127.0.0.1:{port}/health', stdout=subprocess.DEVNULL)
        except Exception:
            run(*compose, 'down')
            raise
        (root / 'current.json').write_text(json.dumps({'sha': sha, 'image': image, 'previous': image}) + '\n')
        authorized = Path('/root/.ssh/authorized_keys')
        with authorized.open('a') as keys:
            keys.write(f'\nrestrict,command="/usr/local/sbin/loftet-deploy {name}" {public_key}\n')
        authorized.chmod(0o600)
    print(f'Registered https://{name}.{DOMAIN} at {sha}; loopback port {port}')


if __name__ == '__main__':
    main()
