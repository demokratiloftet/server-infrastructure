import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthStore,random,hash} from '../packages/auth/store.mjs';
import {AuthService} from '../packages/auth/service.mjs';
import {restrictedFetch} from '../packages/auth/transport.mjs';
const origin='http://127.0.0.1:3000',did='did:plc:alice';
function setup(t){
  const dir=mkdtempSync(join(tmpdir(),'loftet-auth-')),store=new AuthStore(dir);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  const client={callback:async()=>({session:{did,signOut:async()=>{}},state:'flow'}),revoke:async()=>{},authorize:async()=>new URL('http://localhost:2583/oauth/authorize')};
  const provider={definition:{id:'demo',label:'Demo'},start:async()=>({url:'http://127.0.0.1:3002/auth',verifier:'verifier',nonce:'nonce'}),callback:async()=>({issuer:'http://127.0.0.1:3002',subject:'alice',linkedAt:new Date().toISOString()})};
  const auth=new AuthService({store,atproto:{client},providers:[provider],origin});
  const token=random(),key=hash(token),req={headers:{cookie:`loftet-auth=${token}`}},res={headers:{},getHeader(k){return this.headers[k]},setHeader(k,v){this.headers[k]=v}};
  const session={did,loginAt:Date.now(),epoch:'v1'};
  store.set('browser',key,session);store.set('epoch',did,{value:'v1'});store.set('at-session',did,{token:'sensitive-test-token'});
  return {dir,store,auth,req,res,key,provider};
}
test('persistent encrypted storage and AAD binding',t=>{
  const {store,dir}=setup(t);store.set('tokens','id',{secret:'never-plaintext'});
  assert.equal(store.get('tokens','id').secret,'never-plaintext');
  const row=store.db.prepare('SELECT value FROM kv WHERE namespace=? AND key=?').get('tokens','id');
  assert(!row.value.includes('never-plaintext'));assert.throws(()=>store.decrypt(row.value,'other:key'));
  const second=new AuthStore(dir);assert.equal(second.get('tokens','id').secret,'never-plaintext');second.close();
  assert.throws(()=>new AuthStore(dir,'a'.repeat(64)));
});
test('linking needs signed-in fresh AT session and explicit confirmation',async t=>{
  const {auth,store,req,key}=setup(t);
  await assert.rejects(()=>auth.startLink({headers:{}},'demo'));
  await auth.startLink(req,'demo');
  const row=store.db.prepare('SELECT key FROM kv WHERE namespace=?').get('flow');
  const url=new URL(`${origin}/auth/oidc/demo/callback?code=code&state=${row.key}`);
  await assert.rejects(()=>auth.finishLink({headers:{}},'demo',url));
  assert.equal(store.listLinks(did).length,0);
  await auth.finishLink(req,'demo',url);assert.equal(store.listLinks(did).length,0);
  auth.confirmLink(req);assert.equal(store.listLinks(did).length,1);
  assert.throws(()=>auth.confirmLink(req));await assert.rejects(()=>auth.finishLink(req,'demo',url));
  const session=store.get('browser',key);store.set('browser',key,{...session,loginAt:Date.now()-16*60000});
  assert.throws(()=>auth.unlink(req,'demo'));
  store.set('browser',key,{...session,loginAt:Date.now()});auth.unlink(req,'demo');assert.equal(store.listLinks(did).length,0);
});
test('links cannot be stolen or merged by issuer/subject or email',t=>{
  const {store}=setup(t),identity={issuer:'https://idp.example',subject:'alice',linkedAt:'now'};
  store.link(did,'one',identity);
  assert.throws(()=>store.link('did:plc:bob','one',identity));
  assert.throws(()=>store.link(did,'one',{...identity,subject:'other'}));
  assert.throws(()=>store.link('did:plc:bob','alias-for-one',identity));
  store.link('did:plc:bob','two',{...identity,issuer:'https://other.example'});
  assert.equal(store.listLinks('did:plc:bob').length,1);
});
test('login callback binds browser, rejects replay, rotates session and preserves private links',async t=>{
  const {auth,store,req,res,key}=setup(t);
  store.set('at-state','sdk-state',{appState:'flow'});store.set('flow','flow',{browser:key,purpose:'login'});
  const url=new URL(`${origin}/auth/atproto/callback?state=sdk-state&code=abc`);
  await assert.rejects(()=>auth.finishAtproto({headers:{}},res,url));
  await auth.finishAtproto(req,res,url);
  assert.equal(store.get('browser',key),undefined);assert(res.headers['set-cookie'][0].includes('HttpOnly; SameSite=Lax'));
  assert.equal(auth.current(req),undefined);await assert.rejects(()=>auth.finishAtproto(req,res,url));
});
test('logout/account changes, expired flow and duplicate params invalidate linking',async t=>{
  const {auth,store,req,res,key}=setup(t);await auth.startLink(req,'demo');
  const state=store.db.prepare('SELECT key FROM kv WHERE namespace=?').get('flow').key;
  const url=new URL(`${origin}/auth/oidc/demo/callback?state=${state}&code=c`);
  assert.throws(()=>auth.checkParams(new URL(`${url}&state=duplicate`)));
  store.set('flow',state,store.get('flow',state),-1);await assert.rejects(()=>auth.finishLink(req,'demo',url));
  await auth.logout(req,res);assert.equal(auth.current(req),undefined);assert.equal(store.get('at-session',did),undefined);
  assert.equal(store.get('browser',key),undefined);
});
test('auth transport rejects non-allowlisted destinations before fetching',async()=>{
  let called=false;const fetch=restrictedFetch({'https://allowed.example':'https://allowed.example'},async()=>{called=true;return new Response('{}')});
  await assert.rejects(()=>fetch('https://attacker.example/token'));await assert.rejects(()=>fetch('https://secret@allowed.example/token'));
  assert.equal(called,false);await fetch('https://allowed.example/token');assert(called);
});
test('logout while login callback exchanges tokens cannot recreate a browser session',async t=>{
  const {auth,store,req,res,key}=setup(t);let revoked=false;
  store.set('at-state','sdk-state',{appState:'flow'});store.set('flow','flow',{browser:key,purpose:'login'});
  auth.atproto.client.callback=async()=>{store.del('browser',key);return {session:{did,signOut:async()=>{revoked=true}}};};
  await assert.rejects(()=>auth.finishAtproto(req,res,new URL(`${origin}/auth/atproto/callback?state=sdk-state&code=abc`)));
  assert(revoked);assert.equal(auth.current(req),undefined);
});
test('OIDC response cannot attach after browser logout during token exchange',async t=>{
  const {auth,store,req,key,provider}=setup(t);await auth.startLink(req,'demo');
  const state=store.db.prepare('SELECT key FROM kv WHERE namespace=?').get('flow').key;
  provider.callback=async()=>{store.del('browser',key);return {issuer:'https://idp.example',subject:'alice'};};
  await assert.rejects(()=>auth.finishLink(req,'demo',new URL(`${origin}/auth/oidc/demo/callback?state=${state}&code=abc`)));
  assert.equal(store.get('pending',key),undefined);assert.equal(store.listLinks(did).length,0);
});
