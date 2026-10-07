#!/usr/bin/env python3
"""Provision two synthetic accounts on the explicitly named disposable stack."""
import importlib.util,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent.parent
spec=importlib.util.spec_from_file_location('prepare',root/'public-demo/prepare.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=root/'public-demo/test/.runtime/demo.env';env=m.env_file(p)
script=(root/'dist/public-demo/test/provision.js').read_text()
result=subprocess.run(['sh',str(root/'public-demo/test/compose.sh'),'exec','-T','pds','node','--input-type=module','-e',script],input=json.dumps(env),text=True,capture_output=True,check=True)
accounts=json.loads(result.stdout);env['DEMO_ISSUER_DID']=accounts['ISSUER']
m.atomic(p,''.join(k+"='"+v+"'\n" for k,v in env.items()).encode())
print('Provisioned synthetic issuer and organiser in the disposable stack.')
