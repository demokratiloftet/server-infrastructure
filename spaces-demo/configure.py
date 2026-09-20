#!/usr/bin/env python3
"""Create independent alpha credentials; never read or change existing secrets."""
import os
from pathlib import Path
import secrets
import sys

path = Path(__file__).resolve().parent / ('.env.staging' if '--staging' in sys.argv else '.env')
try:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit('Spaces credentials already exist; preserve them with the alpha volume.')
with os.fdopen(fd, 'w') as f:
    for key in ['SPACES_ADMIN_PASSWORD', 'SPACES_JWT_SECRET', 'SPACES_PLC_ROTATION_KEY']:
        f.write(key + '=' + secrets.token_hex(32) + '\n')
print('Created separate Spaces credentials. No services changed.')
