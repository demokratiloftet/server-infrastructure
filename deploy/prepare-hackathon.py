#!/usr/bin/env python3
"""VPS operator bootstrap: private DNS, isolated shared test PDS, fixed PLC bridge."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from sandbox import DOMAIN, NODE, INGRESS, labels, restricted

ROOT = Path('/etc/loftet-deploy/hackathon')


def run(*args, **kw):
    return subprocess.run(args, check=True, **kw)


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]


def ensure_dns():
    # Reuse the existing DNS provider; never copy these credentials into an app.
    env = dict(item.split('=', 1) for item in inspect('server-infrastructure-traefik-1')['Config']['Env'] if '=' in item)
    query = urlencode({'teamId': env['VERCEL_TEAM_ID']})
    def api(path, data=None):
        req = Request('https://api.vercel.com' + path + '?' + query,
                      data=json.dumps(data).encode() if data else None,
                      headers={'Authorization': 'Bearer ' + env['VERCEL_API_TOKEN'], 'Content-Type': 'application/json'})
        with urlopen(req, timeout=30) as response:
            return json.load(response)
    records = api('/v5/domains/demokratiloftet.no/records')['records']
    for name in ['hackaton', '*.hackaton']:
        found = [r for r in records if r['name'] == name and r['type'] in ('A', 'AAAA', 'CNAME')]
        if found and not all(r['type'] == 'A' and r['value'] == '100.83.205.99' for r in found):
            raise ValueError(f'Existing {name} DNS conflicts; nothing will be overwritten')
    for name in ['hackaton', '*.hackaton']:
        if not any(r['name'] == name and r['type'] == 'A' for r in records):
            api('/v2/domains/demokratiloftet.no/records', {'name': name, 'type': 'A', 'value': '100.83.205.99', 'ttl': 60})
        print(f'DNS {name}.demokratiloftet.no -> private proxy')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pds-image', required=True, help='Reviewed Spaces PDS image ID or pinned digest')
    parser.add_argument('--dns', action='store_true', help='Create private wildcard DNS, refusing conflicting records')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Run as VPS operator/root')
    if not (args.pds_image.startswith('sha256:') or '@sha256:' in args.pds_image):
        raise ValueError('Pin the reviewed PDS image by digest')
    image = inspect(args.pds_image)['Id']
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True)
    with open('/var/lib/loftet-deploy/deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.dns:
            ensure_dns()
        secrets_file = ROOT / 'pds.env'
        if not secrets_file.exists():
            secrets_file.write_text('\n'.join(k + '=' + secrets.token_hex(32) for k in
                ['PDS_ADMIN_PASSWORD', 'PDS_JWT_SECRET', 'PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX']) + '\n')
        shutil.copyfile(Path(__file__).with_name('gateway.mjs'), ROOT / 'gateway.mjs')
        (ROOT / 'gateway.mjs').chmod(0o644)
        plc_ip = inspect('server-infrastructure-plc-1')['NetworkSettings']['Networks']['server-infrastructure_private-demo']['IPAddress']
        pds = dict(restricted('512m', 1), image=image, env_file=['./pds.env'],
            networks={'services': {'aliases': ['hackathon-pds']}}, volumes=['pds-data:/app/data'],
            tmpfs=['/tmp:rw,nosuid,nodev,size=32m'],
            environment={'PDS_HOSTNAME': 'pds.' + DOMAIN, 'PDS_PORT': '3000',
                'PDS_DATA_DIRECTORY': '/app/data', 'PDS_BLOBSTORE_DISK_LOCATION': '/app/data/blobs',
                'PDS_DID_PLC_URL': 'http://plc:3000', 'PDS_DEV_MODE': 'false',
                'PDS_DISABLE_SSRF_PROTECTION': 'false', 'PDS_RATE_LIMITS_ENABLED': 'true',
                'PDS_INVITE_REQUIRED': 'true', 'PDS_ACCEPTING_REPO_IMPORTS': 'false', 'PDS_CRAWLERS': '', 'LOG_LEVEL': 'warn'},
            healthcheck={'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/xrpc/_health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
                'interval': '10s', 'timeout': '5s', 'retries': 6, 'start_period': '10s'})
        bridge = dict(restricted('64m', 0.25), image=NODE, command=['node', '/gateway.mjs'],
            volumes=['./gateway.mjs:/gateway.mjs:ro'], environment={'UPSTREAM_HOST': plc_ip},
            networks={'services': {'aliases': ['plc']}, 'core': {}})
        ingress = dict(restricted('64m', 0.25), image=NODE, command=['node', '/gateway.mjs'],
            volumes=['./gateway.mjs:/gateway.mjs:ro'], environment={'UPSTREAM_HOST': 'hackathon-pds'},
            networks=['services', 'ingress'], labels=labels('pds', 'pds.' + DOMAIN),
            depends_on={'pds': {'condition': 'service_healthy'}})
        config = {'services': {'pds': pds, 'plc-bridge': bridge, 'ingress': ingress},
            'volumes': {'pds-data': {'name': 'hackathon-pds-data', 'external': True}},
            'networks': {'services': {'name': 'hackathon-services', 'internal': True, 'enable_ipv6': False},
                'core': {'external': True, 'name': 'server-infrastructure_private-demo'},
                'ingress': {'external': True, 'name': INGRESS}}}
        (ROOT / 'compose.json').write_text(json.dumps(config, indent=2) + '\n')
        run('docker', 'volume', 'create', 'hackathon-pds-data', stdout=subprocess.DEVNULL)
        run('docker', 'run', '--rm', '--network', 'none', '-v', 'hackathon-pds-data:/data', NODE, 'chown', '1000:1000', '/data')
        run('docker', 'compose', '-p', 'hackathon', '--project-directory', str(ROOT), '-f', str(ROOT / 'compose.json'),
            'up', '-d', '--no-build', '--wait', '--wait-timeout', '120')
    print('Shared test PDS: https://pds.' + DOMAIN + ' (Tailscale only; invitations required)')


if __name__ == '__main__':
    main()
