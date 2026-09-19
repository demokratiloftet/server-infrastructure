#!/usr/bin/env python3
"""Validate rendered Compose topology without printing resolved credentials."""
import ipaddress,json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
command=['sh',str(root/'public-demo/test/compose.sh' if '--staging' in sys.argv else root/'public-demo/compose.sh')]
c=json.loads(subprocess.check_output(command+['config','--format','json']))
net=c['networks']['default'];assert net['internal'] is True and not net.get('enable_ipv6',False)
subnet=ipaddress.ip_network(net['ipam']['config'][0]['subnet']);assert subnet.is_private and subnet.prefixlen==24
for name in ['pds','plc','bsky','relay','jetstream','feedgen','ozone','public-calendar','postgres','redis']:
    service=c['services'][name]
    assert set(service['networks'])=={'default'},name+' must have only the private network'
    assert not service.get('ports'),name+' must have no host bindings'
    assert service.get('dns')==[str(subnet.network_address+2)],name+' must use authoritative private DNS'
pds=c['services']['pds']['environment']
for key in ['PDS_DEV_MODE','PDS_DISABLE_SSRF_PROTECTION','PDS_ACCEPTING_REPO_IMPORTS']:assert pds[key]=='false',key
assert pds['PDS_CRAWLERS']=='' and pds['PDS_RATE_LIMITS_ENABLED']=='true'
gateway=c['services']['public-gateway'];assert gateway['read_only'] and gateway['cap_drop']==['ALL']
assert set(gateway['networks'])=={'default','demo-ingress'}
assert not any('docker.sock' in str(m) for m in gateway['volumes'])
assert gateway['environment']['DEMO_PRIVATE_SUBNET']==str(subnet)
assert c['services']['public-calendar']['environment']['APP_ENV']=='public-demo'
assert c['services']['public-calendar']['environment']['DEMO_SELF_SERVICE']=='true'
ids=subprocess.check_output(['docker','network','ls','-q'],text=True).split()
if ids:
    for n in json.loads(subprocess.check_output(['docker','network','inspect',*ids])):
        if n['Name']==net['name']:continue
        for other in n.get('IPAM',{}).get('Config',[]) or []:
            if not other.get('Subnet'):continue
            candidate=ipaddress.ip_network(other['Subnet'])
            assert candidate.version!=subnet.version or not candidate.overlaps(subnet),'Private subnet overlaps '+n['Name']
print('PASS: private topology, fixed DNS, no backend host ports, PDS settings, gateway boundary, subnet availability.')
