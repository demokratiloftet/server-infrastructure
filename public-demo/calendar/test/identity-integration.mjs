// Only a fresh synthetic account on the existing loopback PDS; never reset it.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {sandboxPdsProvisioner} from '../packages/identity/sandbox-pds.mjs';
const handle=`enroll-${randomBytes(4).toString('hex')}.test`,password=randomBytes(24).toString('hex');
const account=await sandboxPdsProvisioner().create({handle,password});
const response=await fetch('http://127.0.0.1:2583/xrpc/com.atproto.server.createSession',{
  method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:handle,password}),
});
assert(response.ok);const session=await response.json();assert.equal(session.did,account.did);
assert.deepEqual(Object.keys(account).sort(),['did','handle']);
console.log('PASS sandbox adapter: new synthetic account created and its chosen password can authenticate. No OIDC browser or Matrix claim.');
console.log('Disposable account remains until a future sandbox reset; no reset performed.');
