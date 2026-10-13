#!/usr/bin/env python3
"""Provision a synthetic hackathon account. Credentials remain in a root-only file."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
from sandbox import app_name, DOMAIN

name = app_name(sys.argv[1])
if os.geteuid() != 0:
    raise SystemExit('Run as VPS operator/root')
os.umask(0o077)
directory = Path('/etc/loftet-deploy/hackathon/accounts')
directory.mkdir(parents=True, exist_ok=True)
path = directory / (name + '.json')
if path.exists():
    account = json.loads(path.read_text())
else:
    account = {'identifier': f'{name}.pds.{DOMAIN}', 'password': secrets.token_urlsafe(32),
               'email': name + '@hackathon.invalid'}
    path.write_text(json.dumps(account) + '\n')
program = r'''
let text=''; for await (const part of process.stdin) text+=part;
const account=JSON.parse(text);
async function rpc(method, body, admin=false) {
  const response=await fetch('http://127.0.0.1:3000/xrpc/'+method, {
    method:'POST', headers:{'content-type':'application/json', ...(admin ? {authorization:'Basic '+Buffer.from('admin:'+process.env.PDS_ADMIN_PASSWORD).toString('base64')} : {})},
    body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Account request failed: '+response.status);
  return response.json();
}
let session;
try { session=await rpc('com.atproto.server.createSession', {identifier:account.identifier,password:account.password}); }
catch(error) {
  if(account.did) throw error;
  const invitation=await rpc('com.atproto.server.createInviteCode',{useCount:1},true);
  session=await rpc('com.atproto.server.createAccount',{handle:account.identifier,password:account.password,email:account.email,inviteCode:invitation.code});
}
process.stdout.write(JSON.stringify({did:session.did}));
'''
result = subprocess.run(['docker', 'exec', '-i', 'hackathon-pds-1', 'node', '--input-type=module', '-e', program],
                        input=json.dumps(account), text=True, capture_output=True)
if result.returncode:
    raise SystemExit('Account provisioning failed; credentials saved for operator recovery (no secrets printed).')
account.update(json.loads(result.stdout))
path.write_text(json.dumps(account) + '\n')
print(f'Account {account["identifier"]}; credentials: {path}; distribute privately to the team, never commit them.')
