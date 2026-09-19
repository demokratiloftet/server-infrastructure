import * as oidc from 'openid-client';
export class OidcProvider {
  constructor(definition, {origin,fetch,allowHttp=false}) {
    if(definition.market && !['NO','SE','DK','FI'].includes(definition.market))throw new Error('Invalid OIDC market');
    this.definition=definition;this.origin=origin;this.fetch=fetch;this.allowHttp=allowHttp;
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(definition.id)) throw new Error('Invalid provider id');
    if(!['none','client_secret_basic','client_secret_post'].includes(definition.clientAuth||'client_secret_post'))throw new Error('Unsupported OIDC client authentication method');
    if(definition.clientAuth!=='none'&&!definition.clientSecret)throw new Error('OIDC client secret is required');
    if(!definition.scopes?.split(' ').includes('openid'))throw new Error('OIDC providers must request openid');
    if(definition.issuer.startsWith('http:')&&!allowHttp)throw new Error('OIDC requires HTTPS');
  }
  async configuration() {
    if(!this.configPromise) this.configPromise=oidc.discovery(new URL(this.definition.issuer),this.definition.clientId,{client_secret:this.definition.clientSecret,id_token_signed_response_alg:this.definition.idTokenAlgorithm||'RS256'},
      this.definition.clientAuth==='none'?oidc.None():this.definition.clientAuth==='client_secret_basic'?oidc.ClientSecretBasic(this.definition.clientSecret):oidc.ClientSecretPost(this.definition.clientSecret),
      { [oidc.customFetch]:this.fetch, execute:[...(this.allowHttp?[oidc.allowInsecureRequests]:[]),oidc.enableNonRepudiationChecks] }
    ).catch(e=>{this.configPromise=undefined;throw e;});
    return this.configPromise;
  }
  async start(state) {
    const config=await this.configuration();
    const verifier=oidc.randomPKCECodeVerifier(),nonce=oidc.randomNonce();
    const url=oidc.buildAuthorizationUrl(config,{
      redirect_uri:`${this.origin}/auth/oidc/${this.definition.id}/callback`,scope:this.definition.scopes,
      state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',
      ...(this.definition.market?{market:this.definition.market}:{}),
      prompt:'login',max_age:'300',...(this.definition.acrValues?{acr_values:this.definition.acrValues}:{}),
    });
    return {url:String(url),verifier,nonce};
  }
  async callback(url,flow) {
    const config=await this.configuration();
    const tokens=await oidc.authorizationCodeGrant(config,url,{pkceCodeVerifier:flow.verifier,expectedState:flow.state,expectedNonce:flow.nonce,idTokenExpected:true,maxAge:300});
    const claims=tokens.claims();
    if(!claims?.sub || typeof claims.sub!=='string' || claims.iss!==this.definition.issuer)throw new Error('Invalid OIDC identity');
    if(this.definition.requiredAcr && claims.acr!==this.definition.requiredAcr)throw new Error('Required authentication assurance was not met');
    // Deliberately discard tokens and all extra claims after verification.
    return {issuer:claims.iss,subject:claims.sub,linkedAt:new Date().toISOString(),...(typeof claims.name==='string'?{displayName:claims.name.slice(0,120)}:{}),...(typeof claims.acr==='string'?{acr:claims.acr}:{})};
  }
}
