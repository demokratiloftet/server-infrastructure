#!/usr/bin/env python3
"""Read-only isolation verification; --staging selects the disposable stack."""
import json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
staging='--staging' in sys.argv
wrapper=root/('public-demo/test/compose.sh' if staging else 'public-demo/compose.sh')
compose=['sh',str(wrapper)]
subprocess.run([sys.executable,str(root/'public-demo/preflight.py')]+(['--staging'] if staging else []),check=True)
config=json.loads(subprocess.check_output(compose+['config','--format','json']))
network=config['networks']['default']['name']
assert json.loads(subprocess.check_output(['docker','network','inspect',network]))[0]['Internal']
for service in ['pds','plc','bsky','relay','jetstream','feedgen','ozone','redis','postgres','public-calendar','public-gateway']:
    cid=subprocess.check_output(compose+['ps','-q',service],text=True).strip();assert cid,service+' is not running'
    c=json.loads(subprocess.check_output(['docker','inspect',cid]))[0]
    if service!='public-gateway':
        assert set(c['NetworkSettings']['Networks'])=={network},service+' has unexpected networks'
        assert not c['HostConfig']['PortBindings'],service+' has a published port'
    assert not any('docker.sock' in m['Source'] for m in c['Mounts']),service+' has Docker access'
pds=json.loads(subprocess.check_output(['docker','inspect',subprocess.check_output(compose+['ps','-q','pds'],text=True).strip()]))[0]
assert pds['Config']['User']=='node' and pds['HostConfig']['ReadonlyRootfs']
assert pds['HostConfig']['CapDrop']==['ALL'] and not pds['HostConfig']['CapAdd']
script=(root/'dist/public-demo/test/isolation.js').read_text()
for service in ['pds','plc','bsky','public-calendar','public-gateway']:
    print('Checking '+service,flush=True)
    subprocess.run(compose+['exec','-T','--user','node',service,'node','--input-type=module','-',*(['gateway'] if service=='public-gateway' else [])],input=script,text=True,check=True)
for service in ['relay','jetstream']:
    cid=subprocess.check_output(compose+['ps','-q',service],text=True).strip()
    print('Checking '+service+' network namespace',flush=True)
    subprocess.run(['docker','run','--rm','-i','--network','container:'+cid,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532','node','--input-type=module','-'],input=script,text=True,check=True)
print('PASS running Docker topology and outbound restrictions.')
