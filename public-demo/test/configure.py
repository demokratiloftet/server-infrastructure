#!/usr/bin/env python3
"""Generate ONLY disposable staging credentials, never read the live .env."""
import importlib.util, json, os, secrets, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent.parent
spec=importlib.util.spec_from_file_location('prepare',root/'public-demo/prepare.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
d=root/'public-demo/test/.runtime';d.mkdir(parents=True,exist_ok=True)
if (d/'base.env').exists():raise SystemExit('Staging already configured; preserve its credentials or remove only this disposable runtime directory deliberately.')
base=m.env_file(root/'.env.example')
for key in ['POSTGRES_PASSWORD','PDS_ADMIN_PASSWORD','PDS_JWT_SECRET','PDS_PLC_ROTATION_KEY','RELAY_ADMIN_PASSWORD','BSKY_ADMIN_PASSWORD','BSKY_SERVICE_SIGNING_KEY','OZONE_ADMIN_PASSWORD','OZONE_SIGNING_KEY_HEX']:base[key]=secrets.token_hex(32)
base['BSKY_INDEXED_AT_EPOCH']='2022-11-17T00:35:16.391+00:00'
base['OZONE_ADMIN_DID']='did:web:ozone.dev.demokratiloftet.no'
demo={'DEMO_NET_PREFIX':'10.249.91','DEMO_BIND_IP':'127.0.0.1','DEMO_HTTPS_PORT':'18443','DEMO_AUTH_ENCRYPTION_KEY':secrets.token_hex(32),'DEMO_ADMIN_KEY':secrets.token_hex(32),'DEMO_ORGANISER_HANDLE':'organiser.pds.dev.demokratiloftet.no','DEMO_ORGANISER_PASSWORD':secrets.token_hex(24),'DEMO_ISSUER_HANDLE':'issuer.pds.dev.demokratiloftet.no','DEMO_ISSUER_PASSWORD':secrets.token_hex(24),'DEMO_ISSUER_DID':'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa','DEMO_FEED_OWNER_DID':'did:plc:vuydyabt34mu5rq5c6fwaevu','DEMO_DNS_RECORDS':json.dumps(m.dns_records('dev.demokratiloftet.no','10.249.91','dev'))}
for name,values in [('base',base),('demo',demo)]:m.atomic(d/(name+'.env'),''.join(k+"='"+v+"'\n" for k,v in values.items()).encode())
(d/'tls').mkdir()
subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(d/'tls/key.pem'),'-out',str(d/'tls/cert.pem'),'-days','7','-subj','/CN=*.dev.demokratiloftet.no','-addext','subjectAltName=DNS:*.dev.demokratiloftet.no'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
os.chmod(d/'tls/key.pem',0o644) # Disposable test key only, readable by container UID 1000.
print('Prepared disposable staging credentials and a self-signed test certificate.')
