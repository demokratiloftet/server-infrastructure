#!/usr/bin/env python3
"""Provision two synthetic accounts on the explicitly named disposable stack."""
import importlib.util,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent.parent
spec=importlib.util.spec_from_file_location('prepare',root/'public-demo/prepare.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=root/'public-demo/test/.runtime/demo.env';env=m.env_file(p)
script=r'''
let data='';for await(const x of process.stdin)data+=x;const config=JSON.parse(data);const accounts={};
for(const role of ['ISSUER','ORGANISER']){
 const handle=config['DEMO_'+role+'_HANDLE'],password=config['DEMO_'+role+'_PASSWORD'];
 const create=await fetch('http://127.0.0.1:3000/xrpc/com.atproto.server.createAccount',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({handle,password,email:role.toLowerCase()+'@example.invalid'})});
 if(!create.ok){const login=await fetch('http://127.0.0.1:3000/xrpc/com.atproto.server.createSession',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:handle,password})});if(!login.ok)throw new Error('Could not provision staging account');accounts[role]=(await login.json()).did;}
 else accounts[role]=(await create.json()).did;
}
console.log(JSON.stringify(accounts));
'''
result=subprocess.run(['sh',str(root/'public-demo/test/compose.sh'),'exec','-T','pds','node','--input-type=module','-e',script],input=json.dumps(env),text=True,capture_output=True,check=True)
accounts=json.loads(result.stdout);env['DEMO_ISSUER_DID']=accounts['ISSUER']
m.atomic(p,''.join(k+"='"+v+"'\n" for k,v in env.items()).encode())
print('Provisioned synthetic issuer and organiser in the disposable stack.')
