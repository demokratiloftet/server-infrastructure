// Real stack acceptance test; only disposable staging accounts/data.
import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const host='pds.dev.demokratiloftet.no',social='demo-social.dev.demokratiloftet.no',calendar='demo-calendar.dev.demokratiloftet.no';
const ca=readFileSync(new URL('./.runtime/tls/cert.pem',import.meta.url));
function request(path,{hostname=host,method='GET',token,data,cookie,raw}={}) {
  return new Promise((yes,no)=>{const body=raw||(data===undefined?undefined:JSON.stringify(data));
    const r=https.request({hostname:'127.0.0.1',port:18443,servername:hostname,ca,path,method,headers:{host:hostname,origin:'https://'+social,...(body?{'content-type':raw?'image/png':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{}),...(cookie?{cookie}:{})}},res=>{let b='';res.on('data',x=>b+=x);res.on('end',()=>yes({status:res.statusCode,headers:res.headers,data:res.headers['content-type']?.includes('application/json')?JSON.parse(b||'null'):b}));});r.on('error',no);r.end(body);
  });
}
const suffix=randomBytes(5).toString('hex');
const account=await request('/xrpc/com.atproto.server.createAccount',{method:'POST',data:{handle:'smoke-'+suffix+'.'+host,email:'smoke-'+suffix+'@example.com',password:randomBytes(24).toString('hex')}});
assert.equal(account.status,200,'Signup: '+JSON.stringify(account.data));
const token=account.data.accessJwt,did=account.data.did;
const post=await request('/xrpc/com.atproto.repo.createRecord',{method:'POST',token,data:{repo:did,collection:'app.bsky.feed.post',record:{$type:'app.bsky.feed.post',text:'Synthetic private demo acceptance '+suffix,createdAt:new Date().toISOString()}}});
assert.equal(post.status,200,'Post creation');
const blob=await request('/xrpc/com.atproto.repo.uploadBlob',{method:'POST',token,raw:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64')});assert.equal(blob.status,200,'Image upload');
const profile=await request('/xrpc/com.atproto.repo.putRecord',{method:'POST',token,data:{repo:did,collection:'app.bsky.actor.profile',rkey:'self',record:{$type:'app.bsky.actor.profile',displayName:'Synthetic demo check',avatar:blob.data.blob}}});assert.equal(profile.status,200,'Profile write');
let indexed=false,last;
for(let i=0;i<30;i++){
 last=await request('/xrpc/app.bsky.feed.getPosts?uris='+encodeURIComponent(post.data.uri),{token});
 if(last.status===200&&last.data.posts?.some(x=>x.uri===post.data.uri)){indexed=true;break;}
 await new Promise(r=>setTimeout(r,1000));
}
assert(indexed,'Private AppView did not index post: '+JSON.stringify(last));
const view=await request('/xrpc/app.bsky.actor.getProfile?actor='+did,{token});assert.equal(view.status,200);assert.equal(view.data.handle,account.data.handle,'Local handle proof');assert(view.data.avatar?.startsWith('https://'+social+'/media/'),'Avatar must use authenticated media gateway');
const mediaPath=new URL(view.data.avatar).pathname;
assert.equal((await request(mediaPath,{hostname:social})).status,401);
const mediaCookie=account.headers['set-cookie'][0].split(';')[0];
const media=await request(mediaPath,{hostname:social,cookie:mediaCookie});assert.equal(media.status,200,'Authenticated image retrieval '+mediaPath+' '+JSON.stringify(media.data));
for(const method of ['com.atproto.sync.getRepo','com.atproto.sync.getBlob','com.atproto.sync.subscribeRepos','com.atproto.server.getServiceAuth','com.atproto.admin.getAccountInfo']) {
 assert.equal((await request('/xrpc/'+method,{token})).status,404,method);
}
assert.equal((await request('/xrpc/app.bsky.feed.getPosts?uris='+encodeURIComponent(post.data.uri))).status,401);
assert.equal((await request('/xrpc/com.atproto.repo.getRecord?repo='+did+'&collection=app.bsky.feed.post&rkey='+post.data.uri.split('/').at(-1))).status,401);
assert.equal((await request('/media/avatar/plain/'+did+'/fake@jpeg',{hostname:social})).status,401);
const state=await request('/api/state',{hostname:calendar});assert.equal(state.status,200);assert.equal(state.data.loggedOut,true);assert.deepEqual(state.data.events,[]);
const start=await request('/auth/atproto/start',{hostname:calendar,method:'POST',data:{}});
// Calendar requires its own Origin.
assert.equal(start.status,403);
console.log('PASS real signup, private post/profile/image, local relay/AppView indexing, authenticated replication denial, anonymous record/media/calendar denial.');
