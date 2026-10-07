#!/usr/bin/env python3
import os
from pathlib import Path
import secrets
import subprocess

root = Path(__file__).resolve().parent / '.runtime'
root.mkdir(exist_ok=True)
fd = os.open(root / 'test.env', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write('PARTITION=dev\nDOMAIN=demokratiloftet.no\nDEMO_NET_PREFIX=10.249.93\n')
    for key in ['SPACES_ADMIN_PASSWORD', 'SPACES_JWT_SECRET', 'SPACES_PLC_ROTATION_KEY']:
        f.write(key + '=' + secrets.token_hex(32) + '\n')
(root / 'tls').mkdir(exist_ok=True)
subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(root / 'tls/key.pem'), '-out', str(root / 'tls/cert.pem'), '-days', '7', '-subj', '/CN=demo-calendar.dev.demokratiloftet.no', '-addext', 'subjectAltName=DNS:demo-calendar.dev.demokratiloftet.no'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
os.chmod(root / 'tls/key.pem', 0o644)  # Disposable test certificate, for container UID 1000.
print('Created disposable Spaces test credentials and TLS certificate.')
