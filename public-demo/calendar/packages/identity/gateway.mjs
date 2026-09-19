import {AuthService} from '../auth/service.mjs';
import {hash,random} from '../auth/store.mjs';
const TTL=10*60000;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
// One process. OIDC identities come exclusively from the configured provider.
export class IdentityGateway extends AuthService {
  constructor(options) {super(options);this.provisioner=options.provisioner;this.entryProviders=new Set(options.entryProviders||[]);}
  onboarding(req) {
    const token=this.token(req),session=token&&this.store.get('browser',hash(token));
    return session?.onboarding && session.onboarding.expires>Date.now()?session.onboarding:undefined;
  }
  requireOnboarding(req) {const value=this.onboarding(req);if(!value)throw fail('Logg inn med organisasjonen på nytt.',401);return value;}
  state(req) {
    const state=super.state(req),entry=this.onboarding(req);
    const signup=entry&&this.store.get('identity-signup',this.store.identityKey(entry.identity));
    return {...state,entryProviders:state.providers.filter(p=>this.entryProviders.has(p.id)),onboarding:entry?{
      provider:entry.provider,displayName:entry.identity.displayName||'Din organisasjonskonto',
      candidateDid:entry.candidateDid,expectedHandle:signup?.handle,expectedDid:entry.expectedDid||signup?.did,
      canCreate:!!this.provisioner&&!entry.expectedDid&&!signup,
      domain:this.provisioner?.domain,needsReview:signup?.status==='creating'||signup?.status==='needs-review',
    }:null};
  }
  async startIdentity(req,res,providerId) {
    if(this.current(req))throw fail('Logg ut før du starter en ny innlogging.');
    const provider=this.providers.get(providerId);
    if(!provider||!this.entryProviders.has(providerId))throw fail('Innlogging er ikke konfigurert for denne leverandøren.');
    // New cookie also invalidates older pending login attempts in this browser.
    const prior=this.token(req);if(prior)this.store.del('browser',hash(prior));
    const token=random(),binding=hash(token),state=random();
    this.store.set('browser',binding,{},TTL);this.cookie(res,token,TTL);
    const flow={browser:binding,purpose:'identity-login',provider:providerId,state};
    this.store.set('flow',state,flow,TTL);
    try {
      const request=await provider.start(state);
      if(!this.store.get('browser',binding))throw fail('Innloggingen ble avbrutt.');
      this.store.set('flow',state,{...flow,verifier:request.verifier,nonce:request.nonce},TTL);
      return {url:request.url};
    }catch(e){this.store.del('flow',state);throw e;}
  }
  async finishOidc(req,res,providerId,url) {
    this.checkParams(url);
    const purpose=this.store.get('flow',url.searchParams.get('state'))?.purpose;
    if(purpose!=='identity-login')return this.finishLink(req,providerId,url);
    const token=this.token(req),binding=token&&hash(token),provider=this.providers.get(providerId);
    if(!provider||!this.entryProviders.has(providerId))throw fail('Ukjent innloggingsleverandør.');
    const flow=this.store.take('flow',url.searchParams.get('state'),f=>f.browser===binding&&f.provider===providerId&&!!this.store.get('browser',binding));
    if(!flow)throw fail('Innloggingen er utløpt eller tilhører en annen nettleser.');
    const identity=await provider.callback(url,flow);
    if(!this.store.get('browser',binding))throw fail('Innloggingen ble avbrutt.');
    if(identity.issuer!==provider.definition.issuer||!identity.subject)throw fail('Ugyldig identitet.');
    const linked=this.store.loginIdentity(identity);
    if(linked){
      try {
        const session=await this.atproto.client.restore(linked.did);
        if(session.did!==linked.did||!this.store.get('browser',binding)||this.store.loginIdentity(identity)?.did!==linked.did)throw fail('Innloggingen ble endret.');
        return super.acceptAtproto(req,res,session,binding);
      }catch{/* Expired/revoked AT authorization requires a fresh OAuth flow. */}
    }
    if(!this.store.get('browser',binding))throw fail('Innloggingen ble avbrutt.');
    const next=random();this.store.del('browser',binding);
    this.store.set('browser',hash(next),{onboarding:{provider:providerId,identity,expectedDid:linked?.did,expires:Date.now()+TTL}},TTL);
    this.cookie(res,next,TTL);
  }
  loginContext(req) {
    const entry=this.onboarding(req);
    if(!entry)return super.loginContext(req);
    const signup=this.store.get('identity-signup',this.store.identityKey(entry.identity));
    if(signup&&signup.status!=='created')throw fail('Kontoopprettelsen må kontrolleres av administrator.',409);
    return {expectedDid:entry.expectedDid||signup?.did};
  }
  async startAtproto(req,res,handle) {
    const expected=this.onboarding(req)&&this.loginContext(req).expectedDid;
    return super.startAtproto(req,res,expected||handle);
  }
  acceptAtproto(req,res,session,binding) {
    const original=this.store.get('browser',binding),entry=original?.onboarding;
    if(!entry)return super.acceptAtproto(req,res,session,binding);
    if(entry.expires<=Date.now())throw fail('Organisasjonsinnloggingen er utløpt.');
    const linked=this.store.loginIdentity(entry.identity),signup=this.store.get('identity-signup',this.store.identityKey(entry.identity));
    const expected=linked?.did||entry.expectedDid||signup?.did;
    if(expected&&expected!==session.did)throw fail('Denne identiteten er knyttet til en annen AT-konto.',409);
    const next=random();this.store.del('browser',binding);
    this.store.set('browser',hash(next),{onboarding:{...entry,candidateDid:session.did}},entry.expires-Date.now());
    this.cookie(res,next,entry.expires-Date.now());
    return session.did;
  }
  confirmIdentity(req,res) {
    const entry=this.requireOnboarding(req),did=entry.candidateDid;
    if(!did||!this.store.get('at-session',did))throw fail('Bekreft AT-kontoen først.');
    try {this.store.link(did,entry.provider,entry.identity,{login:true});}
    catch {throw fail('Kontoen eller identiteten er allerede koblet. Ingen kontoer ble slått sammen.',409);}
    return {did:super.acceptAtproto(req,res,{did},hash(this.token(req)))};
  }
  async createIdentityAccount(req,input) {
    const entry=this.requireOnboarding(req);
    if(!this.provisioner)throw fail('Kontoopprettelse er ikke aktivert.');
    if(entry.expectedDid||entry.candidateDid||this.store.loginIdentity(entry.identity))throw fail('Bruk den tilknyttede kontoen.');
    const key=this.store.identityKey(entry.identity);
    if(this.store.get('identity-signup',key))throw fail('Kontoopprettelse er allerede startet. Fortsett med kontoen eller kontakt administrator.',409);
    this.provisioner.validate(input);
    this.store.set('identity-signup',key,{status:'creating',handle:input.handle});
    try {
      const account=await this.provisioner.create(input);
      this.store.set('identity-signup',key,{status:'created',...account});
      return {handle:account.handle};
    }catch {
      this.store.set('identity-signup',key,{status:'needs-review',handle:input.handle});
      throw fail('Resultatet er usikkert. Kontakt administrator før nytt forsøk.',409);
    }
  }
}
