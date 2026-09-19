import {demoPermission} from './demo-permission.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createPds } from './pds.mjs';
import { createService } from './service.mjs';
import { createAuth } from './auth.mjs';
const environment = process.env.APP_ENV || 'local';
const publicDemo = environment === 'public-demo';
const origin = new URL(process.env.APP_ORIGIN || 'http://127.0.0.1:3000').origin;
const demoKey = process.env.DEMO_ACCESS_KEY || (environment === 'local' ? 'local-demo-only' : '');
if (!demoKey || (environment !== 'local' && (demoKey.length < 24 || !process.env.ISSUER_DID))) throw new Error('Shared demo requires a DEMO_ACCESS_KEY (24+ characters) and pinned ISSUER_DID');
const config = {
  environment,
  organiser:process.env.ORGANISER_HANDLE || 'organiser.test', organiserPassword:process.env.ORGANISER_PASSWORD || (environment === 'local' ? 'local-sandbox-only' : ''),
  issuer:process.env.ISSUER_HANDLE || 'issuer.test', issuerPassword:process.env.ISSUER_PASSWORD || (environment === 'local' ? 'local-sandbox-only' : ''), issuerDid:process.env.ISSUER_DID,
};
if (!config.organiserPassword || !config.issuerPassword) throw new Error('Account credentials are required');
const service = createService(createPds(process.env.PDS_URL || 'http://172.30.83.2:2583'), config);
const auth = createAuth(origin,environment);
const sessions = new Map();
const failures = new Map();
const files = {'/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css'], '/auth-ui.js':['auth-ui.js','text/javascript']};
function authenticated(req) {
  const id = /(?:^|;\s*)demo=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  return (sessions.get(id) || 0) > Date.now();
}
async function body(req) {
  let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 16384) throw Object.assign(new Error('Forespørselen er for stor'), {status:413}); }
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Ugyldig JSON'),{status:400}); }
}
const pathSafe = req => new URL(req.url,origin).pathname;
const server = http.createServer(async (req,res) => {
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('x-content-type-options','nosniff'); res.setHeader('referrer-policy','no-referrer'); res.setHeader('cache-control','no-store');
  const send = (code,data) => { res.writeHead(code,{'content-type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
  try {
    // Reject DNS rebinding as well as cross-origin state changes.
    if (req.headers.host !== new URL(origin).host) return send(403,{error:'Unknown host'});
    const url = new URL(req.url,origin), path = url.pathname;
    if (req.method === 'GET' && path === '/auth/client-metadata.json') return send(200,auth.atproto.metadata);
    if (req.method === 'GET' && path === '/api/auth') return send(200,auth.state(req));
    if (req.method === 'GET' && (path === '/auth/atproto/callback' || /^\/auth\/oidc\/[a-z][a-z0-9-]*\/callback$/.test(path))) {
      let outcome='success';
      try {
        if(path === '/auth/atproto/callback') await auth.finishAtproto(req,res,url);
        else { await auth.finishOidc(req,res,path.split('/')[3],url); outcome='confirm'; }
      } catch { outcome='failed'; }
      res.writeHead(303,{location:`/?auth=${outcome}`}); return res.end();
    }
    if (req.method === 'GET' && path === '/health') return send(200,{ok:true});
    if (req.method === 'GET' && files[path]) { const [file,type] = files[path]; res.setHeader('content-type',`${type}; charset=utf-8`); return res.end(await readFile(new URL(`../public/${file}`,import.meta.url))); }
    if (req.method === 'GET' && path === '/api/state' && publicDemo && !auth.current(req)) return send(200,{loggedOut:true,events:[],clubs:[],categories:[],environment,auth:auth.state(req)});
    if (req.method === 'GET' && path === '/api/state') return send(200,{...await service.state({viewerDid:auth.current(req)?.did,repos:auth.store.accounts()}),authenticated:authenticated(req),auth:auth.state(req)});
    if (req.method !== 'POST') return send(404,{error:'Not found'});
    if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return send(403,{error:'Same-origin JSON requests only'});
    if (path.startsWith('/auth/') && path !== '/auth/atproto/callback') {
      const input = await body(req);
      if(path === '/auth/identity/start') return send(200,await auth.startIdentity(req,res,input.provider));
      if(path === '/auth/identity/confirm') return send(200,auth.confirmIdentity(req,res));
      if(path === '/auth/identity/create') return send(201,await auth.createIdentityAccount(req,input));
      if(path === '/auth/atproto/start') return send(200,await auth.startAtproto(req,res,publicDemo ? process.env.ATPROTO_PDS_ORIGIN : input.handle));
      if(path === '/auth/link/start') return send(200,await auth.startLink(req,input.provider));
      if(path === '/auth/link/confirm') return send(200,auth.confirmLink(req));
      if(path === '/auth/link/cancel') return send(200,auth.cancelLink(req));
      if(path === '/auth/link/remove') return send(200,auth.unlink(req,input.provider));
      if(path === '/auth/logout') return send(200,await auth.logout(req,res));
      return send(404,{error:'Not found'});
    }
    if (path === '/api/demo/permission') {
      return send(200,await demoPermission({environment,auth,service,req,input:await body(req)}));
    }
    if (path === '/api/events') {
      const input=await body(req);
      auth.requireUser(req);
      const oauth=await auth.oauthSession(req);
      return send(201,await service.publish(input,oauth));
    }
    if (publicDemo) return send(404,{error:'Not found'});
    if (path === '/api/session') {
      const address = req.socket.remoteAddress, prior = failures.get(address);
      if (prior && prior.until > Date.now() && prior.count >= 10) return send(429,{error:'For mange forsøk. Vent ett minutt.'});
      const {key} = await body(req), a = Buffer.from(String(key || '')), b = Buffer.from(demoKey);
      if (a.length !== b.length || !timingSafeEqual(a,b)) {
        failures.set(address,{count:prior?.until > Date.now() ? prior.count+1 : 1,until:Date.now()+60000});
        return send(401,{error:'Feil demokode'});
      }
      for (const [id,expires] of sessions) if (expires < Date.now()) sessions.delete(id);
      const id = randomBytes(32).toString('hex'); sessions.set(id,Date.now()+8*3600000);
      res.setHeader('set-cookie',`demo=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${origin.startsWith('https:') ? '; Secure' : ''}`);
      return send(200,{ok:true});
    }
    if (!authenticated(req)) return send(401,{error:'Åpne demo-panelet og logg inn med demokoden først.'});
    const input = await body(req);
    if (path === '/api/grant') return send(200,await service.grant(input.clubId,input.subjectDid));
    if (path === '/api/revoke') return send(200,await service.revoke(input.clubId,input.subjectDid));
    if (path === '/api/seed') return send(200,await service.seed());
    return send(404,{error:'Not found'});
  } catch (error) {
    console.error(pathSafe(req),error.name); // Never log callback URLs, tokens or raw provider errors.
    send(error.status && error.status < 500 ? error.status : 503,{error: error.status && error.status < 500 ? error.message : 'Kan ikke nå sandkassen. Kontroller at PDS kjører, og at demokontoene er konfigurert.'});
  }
});
server.listen(3000,process.env.HOST || '0.0.0.0',()=>console.log(`Loftet calendar: ${origin} (${environment})`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
