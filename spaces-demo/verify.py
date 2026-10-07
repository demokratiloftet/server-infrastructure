#!/usr/bin/env python3
"""Inspect configuration without printing secrets; optionally verify running isolation."""
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
test = '--test' in sys.argv
staging = '--staging' in sys.argv
command = ['sh', str(root / ('spaces-demo/test/compose.sh' if test else 'spaces-demo/compose.sh'))]
if staging:
    command.append('--staging')
config = json.loads(subprocess.check_output(command + ['config', '--format', 'json']))
assert config['networks']['default']['internal'] is True
for name in ['spaces-pds', 'spaces-app']:
    service = config['services'][name]
    assert set(service['networks']) == {'default'}, name
    assert not service.get('ports'), name
    assert service['read_only'] and service['cap_drop'] == ['ALL'], name
    assert not service.get('cap_add'), name
    assert service['dns'] == [config['services']['spaces-pds']['networks']['default']['ipv4_address'].rsplit('.', 1)[0] + '.2']
    assert not any('docker.sock' in str(v) for v in service.get('volumes', []))
    assert not any('traefik' in k for k in service.get('labels', {}))
pds = config['services']['spaces-pds']
assert [v['source'] for v in pds['volumes']] == ['spaces-pds-data']
for key in ['PDS_DEV_MODE', 'PDS_DISABLE_SSRF_PROTECTION', 'PDS_ACCEPTING_REPO_IMPORTS']:
    assert pds['environment'][key] == 'false'
assert pds['environment']['PDS_CRAWLERS'] == ''
assert pds['environment']['PDS_DID_PLC_URL'] == 'http://plc:3000'
assert config['services']['public-gateway']['environment']['SPACES_DEMO_ENABLED'] == 'true'
if not test:
    base_cmd = ['sh', str(root / ('public-demo/test/compose.sh' if staging else 'public-demo/compose.sh'))]
    base = json.loads(subprocess.check_output(base_cmd + ['config', '--format', 'json']))
    for name, service in base['services'].items():
        if name == 'public-gateway':
            service['environment']['SPACES_DEMO_ENABLED'] = 'true'
        assert config['services'][name] == service, 'Unexpected existing service change: ' + name
print('PASS opt-in overlay: existing services preserved, separate PDS volume, private backends, no raw PDS route.')
if '--config-only' in sys.argv:
    raise SystemExit(0)
network = config['networks']['default']['name']
assert json.loads(subprocess.check_output(['docker', 'network', 'inspect', network]))[0]['Internal']
for name in ['spaces-pds', 'spaces-app', 'public-gateway']:
    cid = subprocess.check_output(command + ['ps', '-q', name], text=True).strip()
    assert cid, name + ' is not running'
    actual = json.loads(subprocess.check_output(['docker', 'inspect', cid]))[0]
    expected_networks = {config['networks'][n]['name'] for n in config['services'][name]['networks']}
    assert set(actual['NetworkSettings']['Networks']) == expected_networks
    assert not actual['HostConfig']['Privileged']
    assert not any('docker.sock' in v['Source'] for v in actual['Mounts'])
    if name != 'public-gateway':
        assert not actual['HostConfig']['PortBindings']
        assert actual['HostConfig']['ReadonlyRootfs']
        assert not actual['HostConfig']['CapAdd']
    if name == 'spaces-pds':
        volume = config['volumes']['spaces-pds-data']['name']
        assert any(v.get('Name') == volume and v['Destination'] == '/app/data' for v in actual['Mounts'])
        environment = dict(v.split('=', 1) for v in actual['Config']['Env'])
        for key in ['PDS_DEV_MODE', 'PDS_DISABLE_SSRF_PROTECTION', 'PDS_ACCEPTING_REPO_IMPORTS', 'PDS_CRAWLERS', 'PDS_DID_PLC_URL']:
            assert environment[key] == pds['environment'][key]
    subprocess.run(command + ['exec', '-T', '--user', 'node', name, 'node', '--input-type=module', '-'] + (['gateway'] if name == 'public-gateway' else []), input=(root / 'dist/spaces-demo/test/isolation.js').read_text(), text=True, check=True)
print('PASS running Spaces topology and isolation.')
