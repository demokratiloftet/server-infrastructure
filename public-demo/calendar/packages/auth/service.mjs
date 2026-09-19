import {hash,random} from './store.mjs';
const FLOW_TTL=10*60000,SESSION_TTL=8*3600000,FRESH=15*60000;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export class AuthService {
  constructor({store,atproto,providers=[],origin}) {
    this.store=store;this.atproto=atproto;this.providers=new Map(providers.map(p=>[p.definition.id,p]));this.origin=origin;
    this.cookieName=origin.startsWith('https:')?'__Host-loftet-auth':'loftet-auth';
  }
  token(req) {
    const cookies=(req.headers.cookie||'').split(';').map(s=>s.trim().split('='));
    const value=cookies.find(([name])=>name===this.cookieName)?.[1];
    return /^[a-f0-9]{64}$/.test(value||'')?value:undefined;
  }
  cookie(res,token,ttl=SESSION_TTL) {
    const cookie=`${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttl/1000)}${this.origin.startsWith('https:')?'; Secure':''}`;
    const prior=res.getHeader('set-cookie');res.setHeader('set-cookie',[...(prior?Array.isArray(prior)?prior:[prior]:[]),cookie]);
  }
  browser(req,res) {
    let token=this.token(req),session=token&&this.store.get('browser',hash(token));
    if(!session){token=random();session={};this.store.set('browser',hash(token),session,SESSION_TTL);this.cookie(res,token);}
    return {token,key:hash(token),session};
  }
  current(req) {
    const token=this.token(req);if(!token)return undefined;
    const session=this.store.get('browser',hash(token));
    if(!session?.did || session.epoch!==this.store.get('epoch',session.did)?.value || !this.store.get('at-session',session.did))return undefined;
    return {...session,key:hash(token)};
  }
  requireUser(req,{fresh=false}={}) {
    const user=this.current(req);if(!user)throw fail('Logg inn med AT Protocol først.',401);
    if(fresh && Date.now()-user.loginAt>FRESH)throw fail('Logg inn med AT Protocol på nytt før du endrer kontokoblinger.',401);
    return user;
  }
  state(req) {
    const user=this.current(req),token=this.token(req);
    const pending=token&&this.store.get('pending',hash(token));
    return {
      publicDemo:process.env.APP_ENV==='public-demo',
      local:this.origin.startsWith('http://127.0.0.1:'),
      user:user?{did:user.did,loginAt:user.loginAt}:null,
      providers:[...this.providers.values()].map(p=>({id:p.definition.id,label:p.definition.label,demo:p.definition.demo===true})),
      links:user?this.store.listLinks(user.did).map(l=>({provider:l.provider,linkedAt:l.linkedAt,displayName:l.displayName||`Konto …${l.subject.slice(-6)}`})):[],
      pending: user && pending?.did===user.did ? {provider:pending.provider,displayName:pending.identity.displayName||`Konto …${pending.identity.subject.slice(-6)}`,issuer:pending.identity.issuer}:null,
    };
  }
  loginContext(req) {return {expectedDid:this.current(req)?.did};}
  async startAtproto(req,res,handle) {
    if(typeof handle!=='string'||handle.length>253||!handle.trim())throw fail('Skriv inn kontonavnet ditt.');
    const browser=this.browser(req,res),id=random();
    this.store.set('flow',id,{browser:browser.key,purpose:'login',...this.loginContext(req)},FLOW_TTL);
    try {return {url:String(await this.atproto.client.authorize(handle.trim(),{state:id,prompt:'login'}))};}
    catch(e){this.store.del('flow',id);throw e;}
  }
  async finishAtproto(req,res,url) {
    this.checkParams(url);
    const sdkState=this.store.get('at-state',url.searchParams.get('state'));
    const token=this.token(req),binding=token&&hash(token);
    const flow=sdkState?.appState&&this.store.take('flow',sdkState.appState,f=>f.browser===binding&&f.purpose==='login'&&!!this.store.get('browser',binding));
    if(!flow)throw fail('Innloggingen er utløpt eller startet i en annen nettleser.');
    const {session}=await this.atproto.client.callback(url.searchParams);
    if(!this.store.get('browser',binding)){await session.signOut();throw fail('Innloggingen ble avbrutt.');}
    if(flow.expectedDid && flow.expectedDid!==session.did){await session.signOut();throw fail('Logg ut før du bytter AT Protocol-konto.');}
    return this.acceptAtproto(req,res,session,binding);
  }
  acceptAtproto(req,res,session,binding) {
    const epoch=this.store.get('epoch',session.did)?.value||random(),next=random();
    this.store.set('epoch',session.did,{value:epoch});
    this.store.del('browser',binding);this.store.del('pending',binding);
    this.store.set('browser',hash(next),{did:session.did,loginAt:Date.now(),epoch},SESSION_TTL);
    this.store.addAccount(session.did);this.store.audit(session.did,null,'login');
    this.cookie(res,next);return session.did;
  }
  async startLink(req,providerId) {
    const user=this.requireUser(req,{fresh:true}),provider=this.providers.get(providerId);
    if(!provider)throw fail('Denne leverandøren er ikke konfigurert.',404);
    if(this.store.listLinks(user.did).some(l=>l.provider===providerId))throw fail('Fjern den eksisterende koblingen før du kobler en annen konto.',409);
    const state=random(),request=await provider.start(state);
    this.store.del('pending',user.key);
    this.store.set('flow',state,{browser:user.key,did:user.did,purpose:'link',provider:providerId,state,verifier:request.verifier,nonce:request.nonce},FLOW_TTL);
    return {url:request.url};
  }
  async finishLink(req,providerId,url) {
    this.checkParams(url);
    const user=this.requireUser(req,{fresh:true}),provider=this.providers.get(providerId);
    if(!provider)throw fail('Ukjent leverandør.');
    const flow=this.store.take('flow',url.searchParams.get('state'),f=>f.purpose==='link'&&f.browser===user.key&&f.did===user.did&&f.provider===providerId);
    if(!flow)throw fail('Kontokoblingen er utløpt eller tilhører en annen økt.');
    const identity=await provider.callback(url,flow);
    // Logout/account change during network requests must invalidate the result.
    if(this.requireUser(req,{fresh:true}).key!==user.key)throw fail('Innloggingen ble endret.');
    this.store.set('pending',user.key,{did:user.did,provider:providerId,identity},FLOW_TTL);
  }
  confirmLink(req) {
    const user=this.requireUser(req,{fresh:true});
    const pending=this.store.get('pending',user.key);
    if(!pending || pending.did!==user.did)throw fail('Ingen ventende kontokobling.');
    this.store.link(user.did,pending.provider,pending.identity);this.store.del('pending',user.key);return {ok:true};
  }
  cancelLink(req) {const user=this.requireUser(req);this.store.del('pending',user.key);return {ok:true};}
  unlink(req,provider) {const user=this.requireUser(req,{fresh:true});this.store.unlink(user.did,provider);return {ok:true};}
  async logout(req,res) {
    const user=this.current(req),token=this.token(req);
    if(token){this.store.del('browser',hash(token));this.store.del('pending',hash(token));}
    this.cookie(res,'',0);
    if(user){
      this.store.del('epoch',user.did);
      try {await this.atproto.client.revoke(user.did);}catch{/* Local logout still takes effect when PDS is down. */}
      this.store.del('at-session',user.did);this.store.audit(user.did,null,'logout');
    }
    return {ok:true};
  }
  async oauthSession(req) {const user=this.requireUser(req);return this.atproto.client.restore(user.did);}
  checkParams(url) {
    for(const name of new Set(url.searchParams.keys()))if(url.searchParams.getAll(name).length!==1)throw fail('Duplisert OAuth-parameter.');
    const state=url.searchParams.get('state');if(!state||state.length>512)throw fail('Ugyldig OAuth-state.');
  }
}
