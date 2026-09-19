import {randomUUID} from 'node:crypto';
// Deliberately fixed to the existing host-loopback sandbox. Not a VPS adapter.
export function sandboxPdsProvisioner({fetch:request=fetch}={}) {
  return {
    domain:'test',
    validate({handle,password}={}) {
      if(typeof handle!=='string'||!/^enroll-[a-z0-9-]{1,11}\.test$/.test(handle))throw new Error('Choose enroll- plus 1–11 lowercase letters/digits/hyphens and .test');
      if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('Choose a password of 12–256 characters');
    },
    async create(input) {
      this.validate(input);
      const response=await request('http://127.0.0.1:2583/xrpc/com.atproto.server.createAccount',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json'},
        body:JSON.stringify({handle:input.handle,password:input.password,email:`${randomUUID()}@example.invalid`}),
      });
      if(!response.ok)throw new Error('Sandbox account creation failed');
      const result=await response.json();
      if(typeof result.did!=='string'||!result.did.startsWith('did:plc:')||result.handle!==input.handle)throw new Error('Unexpected sandbox account');
      // Discard registration tokens. The user signs in through normal AT OAuth.
      return {did:result.did,handle:result.handle};
    },
  };
}
