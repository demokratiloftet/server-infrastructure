"""Operator-owned sandbox topology. Application source cannot override it."""
import json
import re

DOMAIN = 'hackaton.demokratiloftet.no'
NODE = 'node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532'
INGRESS = 'server-infrastructure_tailnet-egress'


def app_name(value):
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,48}[a-z0-9]|[a-z]', value) or value in {'pds', 'plc', 'www', 'admin'}:
        raise ValueError('Use a lowercase app name, 1–50 letters/digits/hyphens; reserved names are not apps')
    return value


def labels(name, hostname, aliases=()):
    key = f'traefik.http.routers.sandbox-{name}'
    return {
        'traefik.enable': 'true', 'traefik.docker.network': INGRESS,
        f'{key}.rule': ' || '.join(f'Host(`{host}`)' for host in (hostname, *aliases)),
        f'{key}.entrypoints': 'websecure', f'{key}.tls.certresolver': 'letsencrypt',
        f'{key}.tls.domains[0].main': DOMAIN, f'{key}.tls.domains[0].sans': '*.' + DOMAIN,
        f'{key}.service': f'sandbox-{name}',
        f'traefik.http.services.sandbox-{name}.loadbalancer.server.port': '3000',
    }


def restricted(memory, cpus):
    return dict(init=True, restart='unless-stopped', user='1000:1000', read_only=True,
                cap_drop=['ALL'], security_opt=['no-new-privileges:true'], mem_limit=memory,
                cpus=cpus, pids_limit=100,
                logging={'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '2'}})


def topology(name, port, *, pds=True, aliases=()):
    app_name(name)
    if type(port) is not int or not 3210 <= port <= 3299:
        raise ValueError('Sandbox loopback port must be 3210–3299')
    host = f'{name}.{DOMAIN}'
    app = dict(restricted('256m', 0.5), image=f'loftet-deploy/{name}:unconfigured',
               networks=['sandbox'], environment={'HOST': '0.0.0.0', 'PORT': '3000', 'APP_ORIGIN': f'https://{host}'},
               tmpfs=['/tmp:rw,noexec,nosuid,nodev,size=16m'],
               healthcheck={'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
                            'interval': '10s', 'timeout': '3s', 'retries': 3, 'start_period': '10s'})
    gateway = dict(restricted('64m', 0.25), image=NODE, command=['node', '/gateway.mjs'],
                   volumes=['./gateway.mjs:/gateway.mjs:ro'], ports=[f'127.0.0.1:{port}:3000'],
                   networks=['sandbox', 'ingress'], labels=labels(name, host, aliases),
                   depends_on={'app': {'condition': 'service_healthy'}}, healthcheck=app['healthcheck'])
    networks = {'sandbox': {'internal': True, 'enable_ipv6': False},
                'ingress': {'external': True, 'name': INGRESS}}
    if pds:
        app['environment'].update(PDS_URL='http://gateway:3001', PDS_PUBLIC_URL=f'https://pds.{DOMAIN}')
        gateway['environment'] = {'PDS_PROXY': 'true'}
        gateway['networks'].append('services')
        networks['services'] = {'external': True, 'name': 'hackathon-services'}
    return {'services': {'app': app, 'gateway': gateway}, 'networks': networks}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name', type=app_name)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--without-pds', action='store_true')
    args = parser.parse_args()
    print(json.dumps(topology(args.name, args.port, pds=not args.without_pds), indent=2))
