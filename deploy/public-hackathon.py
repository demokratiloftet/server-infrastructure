#!/usr/bin/env python3
"""Explicit operator publication of reviewed app HTTP routes; PDS stays private."""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from sandbox import DOMAIN, NODE, restricted

ROOT = Path('/etc/loftet-deploy/public-hackathon')
APPS = {'app-protospace': '10.249.99.11', 'sports-publisher': '10.249.99.12', 'sports-viewer': '10.249.99.13'}
PUBLIC_IP = '187.124.129.149'
NETWORK = 'hackathon-public'


def topology():
    networks = {'public': {'name': NETWORK, 'internal': True, 'enable_ipv6': False,
                          'ipam': {'config': [{'subnet': '10.249.99.0/24'}]}}}
    services = {}
    for name, ip in APPS.items():
        networks[name] = {'external': True, 'name': f'protospace-{name}_sandbox'}
        services[name] = dict(restricted('64m', 0.25), image=NODE,
            command=['node', '/gateway.mjs'], volumes=['./gateway.mjs:/gateway.mjs:ro'],
            environment={'UPSTREAM_HOST': 'app'},
            networks={'public': {'ipv4_address': ip}, name: {}},
            healthcheck={'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
                         'interval': '10s', 'timeout': '3s', 'retries': 3})
    return {'services': services, 'networks': networks}


def export_tls():
    certificates = []
    for resolver in json.loads(Path('/root/server-infrastructure/certs/acme.json').read_text()).values():
        for cert in resolver.get('Certificates', []):
            if '*.' + DOMAIN in [cert['domain']['main'], *cert['domain'].get('sans', [])]:
                certificates.append(cert)
    if not certificates:
        raise ValueError('Hackathon wildcard TLS certificate missing')
    cert = certificates[-1]
    bundle = {k: base64.b64decode(cert[v], validate=True).decode() for k, v in [('key', 'key'), ('cert', 'certificate')]}
    directory = ROOT / 'tls'
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(0o755)
    fd, temporary = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(bundle, output)
            output.flush()
            os.fsync(output.fileno())
        os.chown(temporary, 1000, 1000)
        os.replace(temporary, directory / 'tls.json')
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Hackathon certificate exported; no other TLS keys copied')


def public_dns(remove=False):
    inspected = json.loads(subprocess.check_output(['docker', 'inspect', 'server-infrastructure-traefik-1']))[0]
    env = dict(item.split('=', 1) for item in inspected['Config']['Env'] if '=' in item)
    query = urlencode({'teamId': env['VERCEL_TEAM_ID']})
    def api(path, data=None, method=None):
        request = Request('https://api.vercel.com' + path + '?' + query,
            data=json.dumps(data).encode() if data else None, method=method,
            headers={'Authorization': 'Bearer ' + env['VERCEL_API_TOKEN'], 'Content-Type': 'application/json'})
        with urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    records = api('/v5/domains/demokratiloftet.no/records')['records']
    # Exact records override private wildcard DNS. Never publish the wildcard/PDS.
    selected = [f'{name}.hackaton' for name in APPS]
    for name in selected:
        matches = [r for r in records if r['name'] == name and r['type'] in ('A', 'AAAA', 'CNAME')]
        if any(r['type'] != 'A' or r['value'] != PUBLIC_IP for r in matches):
            raise ValueError(f'Conflicting DNS for {name}; refusing to overwrite')
    for name in selected:
        matches = [r for r in records if r['name'] == name and r['type'] == 'A']
        if remove:
            for record in matches:
                api('/v2/domains/demokratiloftet.no/records/' + record['id'], method='DELETE')
        elif not matches:
            api('/v2/domains/demokratiloftet.no/records', {'name': name, 'type': 'A', 'value': PUBLIC_IP, 'ttl': 60})
        print(name + '.demokratiloftet.no: ' + ('private wildcard restored' if remove else PUBLIC_IP))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'tls', 'dns', 'remove-dns'])
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('VPS root/operator required')
    os.umask(0o077)
    if args.action in ('dns', 'remove-dns'):
        return public_dns(args.action == 'remove-dns')
    if args.action == 'tls':
        return export_tls()
    ROOT.mkdir(parents=True, exist_ok=True)
    ROOT.chmod(0o755)
    shutil.copyfile(Path(__file__).with_name('gateway.mjs'), ROOT / 'gateway.mjs')
    (ROOT / 'gateway.mjs').chmod(0o644)
    (ROOT / 'compose.json').write_text(json.dumps(topology(), indent=2) + '\n')
    export_tls()
    print('Prepared separate HTTP bridges; no existing service restarted or DNS published')


if __name__ == '__main__':
    main()
