import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGateway} from '../gateway.mjs';
import {privateFetch,privateProxy} from '../pds-boundary.mjs';
import {answer,resolveAnswer} from '../dns.mjs';
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+s.address().port)));
const close=s=>new Promise(r=>s.close(r));

test('gateway requires real PDS authorization, blocks replication even with a valid token, and gates media',async()=>{
  const calls=[];let revoked=false,lastHeaders;
  const backend=http.createServer(async(req,res)=>{
    calls.push(req.url);lastHeaders=req.headers;let body='';for await(const c of req)body+=c;
    res.setHeader('content-type','application/json');
    if(req.url==='/xrpc/com.atproto.server.getSession'){
      if(req.headers.authorization!=='Bearer issued-token'||revoked){res.statusCode=401;return res.end('{}');}
      return res.end(JSON.stringify({did:'did:plc:abcdefghijklmnopqrstuvwx'}));
    }
    if(req.url==='/xrpc/com.atproto.server.createSession')return res.end(JSON.stringify({accessJwt:'issued-token'}));
    if(req.url==='/xrpc/com.atproto.server.createAccount')return res.end(JSON.stringify({accessJwt:'issued-token',handle:JSON.parse(body).handle}));
    if(req.url.startsWith('/xrpc/com.atproto.sync.getBlob?')){res.setHeader('content-type','image/png');return res.end('image-bytes');}
    return res.end(JSON.stringify({image:'https://bsky.demo.test/img/avatar/plain/test'}));
  });
  const upstream=await listen(backend),dir=await mkdtemp(join(tmpdir(),'loftet-gateway-'));
  await writeFile(join(dir,'index.html'),'<h1>Local demo</h1>');
  const gateway=http.createServer(createGateway({socialHost:'social.demo.test',calendarHost:'calendar.demo.test',pdsHost:'pds.demo.test',cookieDomain:'demo.test',pds:upstream,calendar:upstream,appview:upstream,appviewOrigin:'https://bsky.demo.test',appviewDid:'did:web:bsky.demo.test',staticDir:dir}).handler);
  const base=await listen(gateway);
  const request=(path,{host='pds.demo.test',method='GET',headers={},body}={})=>new Promise((yes,no)=>{
    const req=http.request(base+path,{method,headers:{host,...headers}},res=>{let b='';res.on('data',x=>b+=x);res.on('end',()=>yes({status:res.statusCode,headers:res.headers,body:b}));});req.on('error',no);req.end(body);
  });
  try{
    const auth={authorization:'Bearer issued-token'},origin={origin:'https://social.demo.test','content-type':'application/json'};
    assert.equal((await request('/xrpc/app.bsky.feed.getTimeline')).status,401);
    assert.equal((await request('/xrpc/app.bsky.feed.getTimeline',{headers:{authorization:'Bearer fabricated'}})).status,401);
    const timeline=await request('/xrpc/app.bsky.feed.getTimeline',{headers:auth});assert.equal(timeline.status,200);assert.match(timeline.body,/https:\/\/social.demo.test\/media\/avatar/);
    for(const method of ['com.atproto.sync.getRepo','com.atproto.sync.getBlob','com.atproto.sync.subscribeRepos','com.atproto.repo.importRepo','com.atproto.server.getServiceAuth','com.atproto.admin.getAccountInfo','chat.bsky.convo.sendMessage']){
      const n=calls.length;assert.equal((await request('/xrpc/'+method,{headers:auth})).status,404);assert.equal(calls.length,n);
    }
    for(const path of ['/xrpc/%63om.atproto.sync.getRepo','//xrpc/com.atproto.sync.getRepo','/xrpc/../oauth/token','/xrpc/com.atproto.sync.getRepo/','/static/%2e%2e/secrets'])assert.equal((await request(path,{headers:auth})).status,404);
    assert.equal((await request('/xrpc/app.bsky.feed.getTimeline',{host:'relay.demo.test',headers:auth})).status,404);
    assert.equal((await request('/xrpc/app.bsky.feed.getTimeline',{headers:{...auth,'atproto-proxy':'did:web:api.bsky.app#bsky_appview'}})).status,403);
    assert.equal((await request('/xrpc/com.atproto.repo.createRecord',{method:'POST',headers:{...auth,...origin,origin:'https://evil.test'},body:'{}'})).status,403);
    assert.equal((await request('/media/avatar/plain/did:plc:abcdefghijklmnopqrstuvwx/bafkreitest@jpeg',{host:'social.demo.test'})).status,401);
    const login=await request('/xrpc/com.atproto.server.createSession',{method:'POST',headers:origin,body:'{}'});assert.equal(login.status,200);
    const cookie=login.headers['set-cookie'][0].split(';')[0];assert.match(login.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Strict/);
    assert.equal((await request('/media/avatar/plain/did:plc:abcdefghijklmnopqrstuvwx/bafkreitest@jpeg',{host:'social.demo.test',headers:{cookie}})).status,200);
    revoked=true;assert.equal((await request('/media/avatar/plain/did:plc:abcdefghijklmnopqrstuvwx/bafkreitest@jpeg',{host:'social.demo.test',headers:{cookie}})).status,401);revoked=false;
    assert.equal((await request('/demo/logout',{method:'POST',headers:{...origin,cookie}})).status,204);
    assert.equal((await request('/media/avatar/plain/did:plc:abcdefghijklmnopqrstuvwx/bafkreitest@jpeg',{host:'social.demo.test',headers:{cookie}})).status,401);
    const consent=await request('/@atproto/oauth-provider/~api/consent',{method:'POST',headers:{...origin,authorization:'Bearer ephemeral-proof','x-csrf-token':'csrf','sec-fetch-site':'same-origin',referer:'https://pds.demo.test/oauth/authorize'},body:'{}'});
    assert.equal(consent.status,200);assert.equal(lastHeaders.authorization,'Bearer ephemeral-proof');assert.equal(lastHeaders['x-csrf-token'],'csrf');assert.equal(lastHeaders['sec-fetch-site'],'same-origin');assert.equal(consent.headers['referrer-policy'],'same-origin');
    for(const input of [{handle:'x.bsky.social',email:'x@example.invalid',password:'long-enough-password'},{handle:'x.pds.demo.test',email:'x@example.invalid',password:'long-enough-password',did:'did:plc:attacker'}])assert.equal((await request('/xrpc/com.atproto.server.createAccount',{method:'POST',headers:origin,body:JSON.stringify(input)})).status,400);
    assert.equal((await request('/xrpc/com.atproto.server.createAccount',{method:'POST',headers:origin,body:JSON.stringify({handle:'x.pds.demo.test',email:'x@example.invalid',password:'long-enough-password'})})).status,200);
    for(const path of ['/api/grant','/api/revoke','/api/seed','/api/session'])assert.equal((await request(path,{host:'calendar.demo.test',method:'POST',headers:{...auth,...origin},body:'{}'})).status,404);
    const home=await request('/',{host:'social.demo.test'});assert.equal(home.status,200);assert.match(home.headers['content-security-policy'],/connect-src 'self' https:\/\/social.demo.test/);assert.doesNotMatch(home.headers['content-security-policy'],/https:\/\/bsky.social/);
  }finally{await close(gateway);await close(backend);await rm(dir,{recursive:true});}
});

test('private SSRF exceptions cover only exact GET metadata and PLC documents',async()=>{
  let strictCalls=0,privateCalls=0;
  const fetch=privateFetch(async()=>{strictCalls++;throw new Error('strict SSRF rejection');},async(_input,init)=>{privateCalls++;assert.equal(init.redirect,'error');return new Response('{}');},{calendar:'https://calendar.demo.test',plc:'https://plc.demo.test'});
  assert.equal((await fetch('https://calendar.demo.test/auth/client-metadata.json')).status,200);
  assert.equal((await fetch('https://plc.demo.test/did:plc:abcdefghijklmnopqrstuvwx')).status,200);
  for(const url of ['http://calendar.demo.test/auth/client-metadata.json','https://calendar.demo.test/auth/client-metadata.json?redirect=1','https://calendar.demo.test/api/state','https://calendar.demo.test.evil.test/auth/client-metadata.json','https://plc.demo.test/export','http://169.254.169.254/latest/meta-data','http://127.0.0.1/'])await assert.rejects(()=>fetch(url),/strict SSRF/);
  await assert.rejects(()=>fetch('https://calendar.demo.test/auth/client-metadata.json',{method:'POST'}),/strict SSRF/);
  assert.equal((await fetch('https://plc.demo.test/did%3Aplc%3Aabcdefghijklmnopqrstuvwx')).status,200);
  assert.equal(privateCalls,3);assert.equal(strictCalls,8);
});

test('private service proxy exception does not weaken arbitrary destinations',()=>{
  const calls=[];const dispatcher=privateProxy({dispatch:()=>calls.push('strict'),stream:()=>calls.push('strict-stream')},{dispatch:()=>calls.push('local'),stream:()=>calls.push('local-stream')},'https://bsky.demo.test');
  dispatcher.dispatch({origin:'https://bsky.demo.test',method:'GET',path:'/xrpc/app.bsky.feed.getTimeline'},{});
  dispatcher.dispatch({origin:'https://evil.test',method:'GET',path:'/xrpc/app.bsky.feed.getTimeline'},{});
  dispatcher.dispatch({origin:'https://bsky.demo.test',method:'GET',path:'/admin'},{});
  dispatcher.dispatch({origin:'http://bsky.demo.test',method:'GET',path:'/xrpc/app.bsky.feed.getTimeline'},{});
  dispatcher.stream({origin:'https://bsky.demo.test',method:'GET',path:'/xrpc/app.bsky.feed.getTimeline'},()=>{});
  dispatcher.stream({origin:'https://evil.test',method:'GET',path:'/xrpc/app.bsky.feed.getTimeline'},()=>{});
  assert.deepEqual(calls,['local','strict','strict','strict','local-stream','strict-stream']);
});

test('authoritative DNS returns private records and NXDOMAIN for external names without forwarding',()=>{
  const query=name=>{const header=Buffer.from([0,1,1,0,0,1,0,0,0,0,0,0]);const labels=name.split('.').flatMap(x=>[x.length,...Buffer.from(x)]);return Buffer.concat([header,Buffer.from([...labels,0,0,1,0,1])]);};
  const records={'pds.demo.test':'172.29.90.3'};
  const own=answer(query('pds.demo.test'),records);assert.equal(own.readUInt16BE(6),1);assert.deepEqual([...own.subarray(-4)],[172,29,90,3]);
  const extended=Buffer.concat([query('pds.demo.test'),Buffer.from([0,0,41,4,208,0,0,0,0,0,0])]);extended.writeUInt16BE(1,10);assert.equal(answer(extended,records).readUInt16BE(6),1);
  const external=answer(query('bsky.social'),records);assert.equal(external.readUInt16BE(2)&15,3);assert.equal(external.readUInt16BE(6),0);
  assert.equal(answer(Buffer.from('garbage'),records),null);
});

test('local handle TXT proof is obtained only from the fixed PDS, with no external fallback',async()=>{
 const query=name=>{const header=Buffer.from([0,1,1,0,0,1,0,0,0,0,0,0]);return Buffer.concat([header,Buffer.from([...name.split('.').flatMap(x=>[x.length,...Buffer.from(x)]),0,0,16,0,1])]);};
 let calls=0;const records={'pds.demo.test':'10.249.91.3',pds:'10.249.91.7'};
 const fetcher=async url=>{calls++;assert.equal(new URL(url).origin,'http://10.249.91.7:3000');return Response.json({did:'did:plc:abcdefghijklmnopqrstuvwx'});};
 const local=await resolveAnswer(query('_atproto.alice.pds.demo.test'),records,fetcher);assert.equal(local.readUInt16BE(6),1);assert(local.includes(Buffer.from('did=did:plc:abcdefghijklmnopqrstuvwx')));
 const external=await resolveAnswer(query('_atproto.alice.bsky.social'),records,fetcher);assert.equal(external.readUInt16BE(2)&15,3);assert.equal(calls,1);
});
