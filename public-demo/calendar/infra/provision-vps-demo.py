"""Create only this app's synthetic accounts; persist all credentials privately."""
import json, os, secrets, subprocess, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
os.umask(0o077)
secret_dir=root/'.secrets';secret_dir.mkdir(exist_ok=True,mode=0o700)
accounts_file=secret_dir/'demo-accounts.json'
accounts=json.loads(accounts_file.read_text()) if accounts_file.exists() else {}
container=json.loads(subprocess.check_output(['docker','inspect','server-infrastructure-pds-1']))[0]
ip=container['NetworkSettings']['Networks']['server-infrastructure_default']['IPAddress']
base=f'http://{ip}:3000/xrpc/'
def rpc(method,data,token=None):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 request=urllib.request.Request(base+method,data=json.dumps(data).encode(),headers=headers)
 with urllib.request.urlopen(request,timeout=25) as response:return json.load(response)
def save():accounts_file.write_text(json.dumps(accounts,indent=2));accounts_file.chmod(0o600)
for role in ['organiser','issuer']:
 if role not in accounts:
  handle=f'calendar-{role}.pds.dev.demokratiloftet.no'
  password=secrets.token_urlsafe(32)
  # Credentials are saved before the external write so an interrupted run can be
  # recovered without resetting or replacing an existing account.
  accounts[role]={'handle':handle,'password':password};save()
  created=rpc('com.atproto.server.createAccount',{'handle':handle,'email':f'calendar-{role}@example.invalid','password':password})
  accounts[role]['did']=created['did'];save()
 account=accounts[role]
 if not account.get('appPassword'):
  session=rpc('com.atproto.server.createSession',{'identifier':account['handle'],'password':account['password']})
  account['did']=session['did']
  result=rpc('com.atproto.server.createAppPassword',{'name':'Loftet calendar'},session['accessJwt'])
  account['appPassword']=result['password'];save()
envfile=root/'.env.vps'
if not envfile.exists():
 demo_secret=secrets.token_hex(32)
 app='https://calendar.dev.demokratiloftet.no';idp='https://identity.dev.demokratiloftet.no'
 origins=['https://pds.dev.demokratiloftet.no','https://plc.dev.demokratiloftet.no',idp]
 values={
  'APP_ORIGIN':app,'CALENDAR_HOST':'calendar.dev.demokratiloftet.no','DEMO_IDP_HOST':'identity.dev.demokratiloftet.no',
  'ATPROTO_DOCKER_NETWORK':'server-infrastructure_default','PDS_DOCKER_HOST':'pds','PDS_DOCKER_PORT':'3000',
  'ORGANISER_HANDLE':accounts['organiser']['handle'],'ORGANISER_PASSWORD':accounts['organiser']['appPassword'],
  'ISSUER_HANDLE':accounts['issuer']['handle'],'ISSUER_PASSWORD':accounts['issuer']['appPassword'],'ISSUER_DID':accounts['issuer']['did'],
  'DEMO_ACCESS_KEY':secrets.token_hex(24),'AUTH_ENCRYPTION_KEY':secrets.token_hex(32),
  'ATPROTO_PDS_ORIGIN':origins[0],'ATPROTO_PLC_URL':origins[1],
  'AUTH_FETCH_ROUTES_JSON':json.dumps({url:url for url in origins},separators=(',',':')),
  'DEMO_OIDC_SECRET':demo_secret,
  'OIDC_PROVIDERS_JSON':json.dumps([{'id':'demo','label':'Demo-identitet','demo':True,'issuer':idp,'clientId':'loftet-demo','clientSecret':demo_secret,'clientAuth':'client_secret_post','scopes':'openid profile'}],separators=(',',':')),
 }
 envfile.write_text(''.join(f'{k}={v}\n' for k,v in values.items()));envfile.chmod(0o600)
else:
 values=dict(line.split('=',1) for line in envfile.read_text().splitlines() if line and not line.startswith('#'))
access={'calendar':'https://calendar.dev.demokratiloftet.no','organiser':{'handle':accounts['organiser']['handle'],'password':accounts['organiser']['password']},'demoAccessKey':values['DEMO_ACCESS_KEY']}
(secret_dir/'demo-access.json').write_text(json.dumps(access,indent=2))
print('Synthetic organiser and issuer ready. Credentials saved in private files; no passwords printed.')
