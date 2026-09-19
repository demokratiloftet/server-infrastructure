#!/usr/bin/env python3
"""Prepare an existing VPS deployment. Does not change DNS or start services."""
import argparse, base64, ipaddress, json, os, re, secrets, subprocess
from pathlib import Path

def env_file(path):
    result={}
    for line in Path(path).read_text().splitlines():
        line=line.strip()
        if not line or line.startswith('#'): continue
        key,sep,value=line.partition('=')
        if not sep or not re.fullmatch(r'[A-Z][A-Z0-9_]*',key): raise ValueError('Unsupported env file format')
        if value[:1] in ('"',"'") and value[-1:]==value[:1]: value=value[1:-1]
        result[key]=value
    return result

def dns_records(base,prefix,partition):
    ipaddress.ip_network(prefix+'.0/24')
    records={name+'.'+base:prefix+'.3' for name in ['traefik','pds','plc','bsky','relay','jetstream','feedgen','ozone','social','demo-calendar']}
    for name,n in {'pds':7,'plc':6,'bsky':12,'relay':8,'jetstream':9,'feedgen':10,'ozone':11,'social':13,'postgres':4,'redis':5,'public-calendar':15}.items():records[name]=prefix+'.'+str(n)
    records['postgres-'+partition]=prefix+'.4'
    return records

def atomic(path,data,mode=0o600,uid=None):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.'+secrets.token_hex(8))
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        if uid is not None:os.chown(temp,uid,uid)
        os.replace(temp,path)
    finally:
        if temp.exists():temp.unlink()

def export_tls(acme,base,directory):
    found=[]
    for resolver in json.loads(Path(acme).read_text()).values():
        if not isinstance(resolver,dict):continue
        for cert in resolver.get('Certificates',[]):
            names=[cert['domain']['main'],*cert['domain'].get('sans',[])]
            if '*.'+base in names:found.append(cert)
    if not found:raise ValueError('No existing wildcard TLS certificate for the demo domain')
    cert=found[-1];directory=Path(directory);directory.mkdir(parents=True,exist_ok=True);os.chmod(directory,0o755)
    # Gateway runs as UID 1000. These files are never committed or logged.
    atomic(directory/'key.pem',base64.b64decode(cert['key']),uid=1000 if os.geteuid()==0 else None)
    atomic(directory/'cert.pem',base64.b64decode(cert['certificate']),uid=1000 if os.geteuid()==0 else None)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--calendar-env',default='/root/calendar-app/.env.vps')
    p.add_argument('--root',type=Path,default=Path(__file__).resolve().parent.parent)
    mode=p.add_mutually_exclusive_group()
    mode.add_argument('--certificates-only',action='store_true')
    mode.add_argument('--configuration-only',action='store_true')
    a=p.parse_args();root=a.root;env=env_file(root/'.env');base=env['PARTITION']+'.'+env['DOMAIN']
    if not re.fullmatch(r'[a-z0-9-]+(?:\.[a-z0-9-]+)+',base):raise ValueError('Invalid domain')
    if not a.configuration_only:export_tls(root/'certs/acme.json',base,root/'public-demo/.tls')
    target=root/'public-demo/.env'
    if not a.certificates_only:
        prior=env_file(target) if target.exists() else {};calendar=env_file(a.calendar_env)
        values={**prior,'DEMO_NET_PREFIX':prior.get('DEMO_NET_PREFIX','10.249.90'),'DEMO_BIND_IP':prior.get('DEMO_BIND_IP','127.0.0.1'),'DEMO_HTTPS_PORT':prior.get('DEMO_HTTPS_PORT','8443')}
        for key in ['ORGANISER_HANDLE','ORGANISER_PASSWORD','ISSUER_HANDLE','ISSUER_PASSWORD','ISSUER_DID']:values['DEMO_'+key]=calendar[key]
        values.setdefault('DEMO_AUTH_ENCRYPTION_KEY',secrets.token_hex(32));values.setdefault('DEMO_ADMIN_KEY',secrets.token_hex(32))
        volume=json.loads(subprocess.check_output(['docker','volume','inspect','server-infrastructure_feedgen_publisher_did']))[0]
        values['DEMO_FEED_OWNER_DID']=(Path(volume['Mountpoint'])/'publisher-did.txt').read_text().strip()
        if not re.fullmatch(r'did:plc:[a-z2-7]{24}',values['DEMO_FEED_OWNER_DID']):raise ValueError('Invalid local feed owner')
        values['DEMO_DNS_RECORDS']=json.dumps(dns_records(base,values['DEMO_NET_PREFIX'],env['PARTITION']),separators=(',',':'))
        if any('\n' in v or "'" in v for v in values.values()):raise ValueError('Unsupported env value; never source this file as shell code')
        atomic(target,(''.join(k+"='"+v+"'\n" for k,v in values.items())).encode())
    print('Prepared requested private configuration/TLS files; no services or DNS changed.')

if __name__=='__main__':main()
