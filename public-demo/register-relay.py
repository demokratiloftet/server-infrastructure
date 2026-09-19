#!/usr/bin/env python3
"""Register only this deployment's PDS on its private relay; sends no public request."""
import importlib.util,json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('prepare',root/'public-demo/prepare.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
staging='--staging' in sys.argv
base=m.env_file(root/('public-demo/test/.runtime/base.env' if staging else '.env'))
data={'password':base['RELAY_ADMIN_PASSWORD'],'host':'pds.'+base['PARTITION']+'.'+base['DOMAIN']}
script="""let text='';for await(const x of process.stdin)text+=x;const c=JSON.parse(text);const r=await fetch('http://relay:3000/admin/pds/requestCrawl',{method:'POST',headers:{authorization:'Basic '+Buffer.from('admin:'+c.password).toString('base64'),'content-type':'application/json'},body:JSON.stringify({hostname:c.host}),signal:AbortSignal.timeout(15000)});if(!r.ok){console.error('Private relay registration failed: HTTP '+r.status);process.exit(1);}console.log('Registered own PDS with own private relay.');"""
subprocess.run(['sh',str(root/('public-demo/test/compose.sh' if staging else 'public-demo/compose.sh')),'exec','-T','pds','node','--input-type=module','-e',script],input=json.dumps(data),text=True,check=True)
