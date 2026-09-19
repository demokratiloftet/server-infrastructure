import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoPermission} from '../src/demo-permission.mjs';
test('demo permission shortcut is local-only, authenticated and bound to the current DID',async()=>{
 let calls=0;const args={environment:'local',auth:{requireUser:()=>({did:'did:plc:current'})},service:{grant:async(club,did)=>{calls++;assert.equal(club,'fjord');assert.equal(did,'did:plc:current');}},req:{},input:{action:'grant',clubId:'fjord',subjectDid:'did:plc:victim'}};
 await assert.rejects(()=>demoPermission({...args,environment:'shared'}),{status:404});
 await assert.rejects(()=>demoPermission({...args,auth:{requireUser(){throw Object.assign(Error('Login required'),{status:401});}}}),{status:401});
 await assert.rejects(()=>demoPermission({...args,input:{action:'seed'}}),{status:400});assert.equal(calls,0);
 await demoPermission(args);assert.equal(calls,1);
});

test('public self-service requires explicit opt-in and always uses the signed-in subject',async()=>{
 const original=process.env.DEMO_SELF_SERVICE;
 try {
  let subject;const args={environment:'public-demo',auth:{requireUser:()=>({did:'did:plc:current'})},service:{grant:async(_club,did)=>{subject=did;}},req:{},input:{action:'grant',clubId:'fjord',subjectDid:'did:plc:victim'}};
  delete process.env.DEMO_SELF_SERVICE;await assert.rejects(()=>demoPermission(args),{status:404});
  process.env.DEMO_SELF_SERVICE='true';await demoPermission(args);assert.equal(subject,'did:plc:current');
  await assert.rejects(()=>demoPermission({...args,auth:{requireUser(){throw Object.assign(Error('Login required'),{status:401});}}}),{status:401});
 }finally{if(original===undefined)delete process.env.DEMO_SELF_SERVICE;else process.env.DEMO_SELF_SERVICE=original;}
});
