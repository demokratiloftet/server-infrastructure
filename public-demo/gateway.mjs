import http from 'node:http';
import https from 'node:https';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {safePath,rpcPolicy,signupBody,rewriteMedia,oauthPosts} from './policy.mjs';

const error=(status,message)=>Object.assign(new Error(message),{status});
const hash=x=>createHash('sha256').update(x).digest('hex');
export function createGateway(c) {
  const sessions=new Map(),rates=new Map();
  const hosts=new Set([c.socialHost,c.calendarHost,c.pdsHost]);
  const origins=new Set([...hosts].map(h=>'https://'+h));
  const cookieName='__Secure-loftet-media';
  const cookie=v=>`${cookieName}=${v}; Domain=${c.cookieDomain}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${v?7200:0}`;
  const cleanup=()=>{const now=Date.now();for(const [k,v]of sessions)if(v.until<now)sessions.delete(k);for(const[k,v]of rates)if(v.until<now)rates.delete(k);};
  function rate(req,signup=false) {
    cleanup();const k=(signup?'signup:':'request:')+req.socket.remoteAddress;
    const window=signup?3600000:60000,limit=signup?10:300;
    const v=rates.get(k)||{n:0,until:Date.now()+window};v.n++;rates.set(k,v);
    if(v.n>limit)throw error(429,'Too many requests');
    if(rates.size>100000)throw error(503,'Busy');
  }
  async function body(req,limit=6*1024*1024) {
    const chunks=[];let n=0;for await(const x of req){n+=x.length;if(n>limit)throw error(413,'Request too large');chunks.push(x);}return Buffer.concat(chunks);
  }
  async function upstream(base,path,method,headers={},data) {
    // Never follow a redirect, accept a browser-supplied upstream, or use a proxy env var.
    const u=new URL(path,base);if(u.origin!==new URL(base).origin)throw error(400,'Invalid upstream');
    return new Promise((yes,no)=>{
      const request=(u.protocol==='https:'?https:http).request(u,{method,headers,timeout:15000},r=>{
        let n=0;const chunks=[];r.on('data',x=>{n+=x.length;if(n>12*1024*1024){r.destroy();no(error(502,'Response too large'));}else chunks.push(x);});
        r.on('error',no);r.on('end',()=>yes({status:r.statusCode,headers:r.headers,body:Buffer.concat(chunks)}));
      });request.on('timeout',()=>request.destroy(error(504,'Upstream timeout')));request.on('error',no);request.end(data);
    });
  }
  function cookieToken(req) {
    const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    return raw&&sessions.get(hash(raw));
  }
  async function bearer(req,allowCookie=false) {
    const value=req.headers.authorization;
    const token=value?.startsWith('Bearer ')?value.slice(7):(allowCookie?cookieToken(req)?.token:undefined);
    if(!token||token.length>8192)throw error(401,'Sign in first');
    const result=await upstream(c.pds,'/xrpc/com.atproto.server.getSession','GET',{authorization:'Bearer '+token,host:c.pdsHost});
    if(result.status!==200)throw error(401,'Sign in again');
    const account=JSON.parse(result.body);if(!account.did?.startsWith('did:plc:'))throw error(401,'Local account required');
    return {token,did:account.did};
  }
  function send(res,result) {
    res.statusCode=result.status;
    for(const name of ['content-type','set-cookie','location','dpop-nonce','retry-after']){
      const v=result.headers[name];if(v!==undefined)res.setHeader(name,v);
    }
    res.end(result.body);
  }
  function storeSession(res,result) {
    if(result.status!==200)return;
    const data=JSON.parse(result.body);if(typeof data.accessJwt!=='string')return;
    cleanup();if(sessions.size>=10000)throw error(503,'Too many active sessions');
    const id=randomBytes(32).toString('hex');sessions.set(hash(id),{token:data.accessJwt,until:Date.now()+7200000});
    res.setHeader('set-cookie',cookie(id));
  }
  async function handler(req,res) {
    res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
    res.setHeader('strict-transport-security','max-age=31536000');
    const connect=[...origins].join(' ');
    res.setHeader('content-security-policy',`default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ${connect}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; worker-src 'self' blob:`);
    try {
      if(!hosts.has(req.headers.host)||!safePath(req.url))throw error(404,'Not found');
      rate(req);const url=new URL(req.url,'https://'+req.headers.host),p=url.pathname;
      if(req.headers.origin&&!origins.has(req.headers.origin))throw error(403,'Unknown origin');
      if(req.headers.origin){res.setHeader('access-control-allow-origin',req.headers.origin);res.setHeader('access-control-allow-credentials','true');res.setHeader('vary','Origin');res.setHeader('access-control-expose-headers','DPoP-Nonce');}
      if(req.method==='OPTIONS'){
        if(!req.headers.origin)throw error(403,'Origin required');
        res.setHeader('access-control-allow-methods','GET, POST');
        res.setHeader('access-control-allow-headers','authorization, content-type, atproto-proxy, atproto-accept-labelers, dpop');res.statusCode=204;return res.end();
      }
      if(!['GET','POST'].includes(req.method))throw error(405,'Method not allowed');
      if(req.method==='POST'&&!origins.has(req.headers.origin))throw error(403,'Origin required');
      const isPds=req.headers.host===c.pdsHost,isCalendar=req.headers.host===c.calendarHost;
      if(isCalendar&&c.spaces&&p.startsWith('/spaces/')){
        const reads=new Set(['/spaces/','/spaces/app.js','/spaces/style.css','/spaces/api/me','/spaces/api/group']);
        const writes=new Set(['/spaces/api/signup','/spaces/api/login','/spaces/api/logout','/spaces/api/groups','/spaces/api/notices','/spaces/api/members']);
        if(!(req.method==='GET'?reads:writes).has(p))throw error(404,'Not found');
        if(p==='/spaces/api/signup'||p==='/spaces/api/login')rate(req,true);
        const headers={host:c.calendarHost};
        for(const k of ['content-type','cookie','origin'])if(req.headers[k])headers[k]=req.headers[k];
        return send(res,await upstream(c.spaces,req.url,req.method,headers,req.method==='POST'?await body(req,8192):undefined));
      }
      if(isPds&&p==='/demo/logout'&&req.method==='POST'){
        const session=cookieToken(req);for(const[k,v]of sessions)if(v===session)sessions.delete(k);
        res.setHeader('set-cookie',cookie(''));res.statusCode=204;return res.end();
      }
      if(isPds&&p.startsWith('/xrpc/')){
        const method=p.slice(6),policy=rpcPolicy(method,req.method);if(policy==='deny')throw error(404,'Not found');
        const headers={host:c.pdsHost,'x-forwarded-for':req.socket.remoteAddress,'x-forwarded-proto':'https'};
        if(req.headers['content-type'])headers['content-type']=req.headers['content-type'];
        if(req.headers.authorization)headers.authorization=req.headers.authorization;
        // Client-selected service destinations never pass through this gateway.
        if(req.headers['atproto-proxy']&&req.headers['atproto-proxy']!==c.appviewDid+'#bsky_appview')throw error(403,'External service unavailable');
        headers['atproto-accept-labelers']=c.labelerDid||'';
        if(policy==='authenticated')await bearer(req);
        let data=req.method==='POST'?await body(req):undefined;
        if(method==='com.atproto.server.createAccount'){
          rate(req,true);try{data=Buffer.from(JSON.stringify(signupBody(JSON.parse(data),c.pdsHost)));}catch{throw error(400,'Choose a local handle, valid email and a password of at least 12 characters');}
        }
        if(method==='com.atproto.repo.uploadBlob'&&!['image/png','image/jpeg','image/webp'].includes(headers['content-type']))throw error(415,'Only images are supported');
        const result=await upstream(c.pds,req.url,req.method,headers,data);
        if(['com.atproto.server.createAccount','com.atproto.server.createSession','com.atproto.server.refreshSession'].includes(method))storeSession(res,result);
        if(method==='com.atproto.server.deleteSession'){
          const token=cookieToken(req)?.token;for(const[k,v]of sessions)if(v.token===token)sessions.delete(k);
          res.setHeader('set-cookie',cookie(''));
        }
        if(result.headers['content-type']?.includes('application/json')){
          result.body=Buffer.from(JSON.stringify(rewriteMedia(JSON.parse(result.body),c.appviewOrigin,'https://'+c.socialHost)));
        }
        return send(res,result);
      }
      if(isPds){
        res.setHeader('referrer-policy','same-origin');
        const ui=p.startsWith('/@atproto/oauth-provider/');
        const api=p.startsWith('/@atproto/oauth-provider/~api/');
        const operation=p.slice('/@atproto/oauth-provider/~api/'.length);
        const page=['/oauth/authorize','/oauth/authorize/redirect'].includes(p);
        const asset=ui&&!api&&/\.(js|css|woff2?|svg|png|ico)$/.test(p);
        if(!((req.method==='GET'&&(page||asset))||(req.method==='POST'&&api&&oauthPosts.has(operation))))throw error(404,'Not found');
        if(page&&url.searchParams.has('client_id')&&url.searchParams.get('client_id')!=='https://'+c.calendarHost+'/auth/client-metadata.json')throw error(403,'Unknown client');
        if(operation==='sign-up')rate(req,true);
        const headers={host:c.pdsHost,'x-forwarded-for':req.socket.remoteAddress,'x-forwarded-proto':'https'};for(const k of ['content-type','cookie','origin','referer','accept','authorization','x-csrf-token','sec-fetch-site','sec-fetch-mode','sec-fetch-dest','sec-fetch-user'])if(req.headers[k])headers[k]=req.headers[k];
        return send(res,await upstream(c.pds,req.url,req.method,headers,req.method==='POST'?await body(req,32768):undefined));
      }
      if(isCalendar){
        const reads=new Set(['/','/app.js','/auth-ui.js','/style.css','/api/auth','/api/state','/auth/client-metadata.json','/auth/atproto/callback']);
        const writes=new Set(['/auth/atproto/start','/auth/logout','/api/events','/api/demo/permission']);
        if(!(req.method==='GET'?reads:writes).has(p))throw error(404,'Not found');
        const headers={host:c.calendarHost};for(const k of ['content-type','cookie','origin','accept'])if(req.headers[k])headers[k]=req.headers[k];
        return send(res,await upstream(c.calendar,req.url,req.method,headers,req.method==='POST'?await body(req,32768):undefined));
      }
      if(p.startsWith('/media/')&&req.method==='GET'){
        await bearer(req,true);
        const match=/^\/media\/[a-z_]+\/plain\/(did:plc:[a-z2-7]{24})\/(b[a-z2-7]+)(?:@(?:jpeg|png|webp))?$/.exec(p);
        if(!match||url.search)throw error(404,'Image not found');
        // Fetch the original image only from our PDS. No external CDN or URL resolution.
        const result=await upstream(c.pds,'/xrpc/com.atproto.sync.getBlob?'+new URLSearchParams({did:match[1],cid:match[2]}),'GET',{host:c.pdsHost});
        if(!/^image\/(jpeg|png|webp|avif)/.test(result.headers['content-type']||''))throw error(404,'Image not found');return send(res,result);
      }
      if(req.method!=='GET')throw error(404,'Not found');
      const filename=p.startsWith('/static/')?p:(['/favicon.ico','/manifest.json'].includes(p)?p:'/index.html');
      if(filename.endsWith('.map'))throw error(404,'Not found');
      const file=resolve(c.staticDir,'.'+filename);if(!file.startsWith(resolve(c.staticDir)+sep))throw error(404,'Not found');
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json','.webp':'image/webp'};
      res.setHeader('content-type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));
    }catch(e){res.statusCode=e.status||503;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:e.status?e.message:'Service unavailable'}));}
  }
  return {handler};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const e=process.env;for(const k of ['DEMO_BASE_DOMAIN','DEMO_SOCIAL_HOST','DEMO_CALENDAR_HOST','PDS_HOST','TLS_DIRECTORY'])if(!e[k])throw new Error('Missing '+k);
  const c={socialHost:e.DEMO_SOCIAL_HOST,calendarHost:e.DEMO_CALENDAR_HOST,pdsHost:e.PDS_HOST,cookieDomain:e.DEMO_BASE_DOMAIN,
    pds:'http://pds:3000',calendar:'http://public-calendar:3000',appview:'http://bsky:2584',
    appviewOrigin:'https://bsky.'+e.DEMO_BASE_DOMAIN,appviewDid:'did:web:bsky.'+e.DEMO_BASE_DOMAIN,labelerDid:e.LABELER_DID,staticDir:'/social/web-build'};
  if(e.SPACES_DEMO_ENABLED==='true')c.spaces='http://spaces-app:3000';
  for(const h of [c.socialHost,c.calendarHost,c.pdsHost])if(!h.endsWith('.'+c.cookieDomain)||!/^[-a-z0-9.]+$/.test(h))throw new Error('Invalid demo hostname');
  const tls=async()=>({key:await readFile(e.TLS_DIRECTORY+'/key.pem'),cert:await readFile(e.TLS_DIRECTORY+'/cert.pem')});
  const server=https.createServer(await tls(),createGateway(c).handler);server.requestTimeout=20000;server.headersTimeout=10000;
  server.on('upgrade',(_req,socket)=>socket.destroy());server.listen(8443,'0.0.0.0');
  let mtime=0;setInterval(async()=>{try{const s=await stat(e.TLS_DIRECTORY+'/cert.pem');if(s.mtimeMs!==mtime){server.setSecureContext(await tls());mtime=s.mtimeMs;}}catch{/* Keep the last valid certificate. */}},60000).unref();
}
