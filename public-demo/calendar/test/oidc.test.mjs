import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {OidcProvider} from '../packages/auth/oidc.mjs';
const issuer='https://identity.example',origin='https://app.example',clientId='test-client';
const {privateKey,publicKey}=await generateKeyPair('RS256'),publicJwk={...await exportJWK(publicKey),kid:'test',alg:'RS256',use:'sig'};
async function scenario(change={},badSignature=false){
  const now=Math.floor(Date.now()/1000),other=badSignature?await generateKeyPair('RS256'):null;
  const token=await new SignJWT({sub:'alice',nonce:'nonce',auth_time:now,...change}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuedAt().setIssuer(change.iss||issuer).setAudience(change.aud||clientId).setExpirationTime(change.exp||now+300).sign(other?.privateKey||privateKey);
  let tokenCalls=0;
  const fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/.well-known/openid-configuration'))return Response.json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256']});
    if(url.endsWith('/jwks'))return Response.json({keys:[publicJwk]});
    if(url.endsWith('/token')){tokenCalls++;assert.equal(new URLSearchParams(init.body).get('code_verifier'),'verifier');return Response.json({token_type:'Bearer',access_token:'unused',id_token:token,expires_in:300});}
    throw new Error('Unexpected URL');
  };
  const provider=new OidcProvider({id:'demo',label:'Demo',issuer,clientId,clientSecret:'test-secret',scopes:'openid'},{origin,fetch});
  return {provider,tokenCalls:()=>tokenCalls,flow:{state:'state',nonce:'nonce',verifier:'verifier'}};
}
test('OIDC validates signed ID token and returns minimal identity, not tokens',async()=>{
  const {provider,flow}=await scenario();const identity=await provider.callback(new URL(`${origin}/auth/oidc/demo/callback?code=test&state=state`),flow);
  assert.equal(identity.subject,'alice');assert.equal(identity.issuer,issuer);assert.equal(identity.access_token,undefined);
});
for(const [name,change,badSignature] of [['nonce',{nonce:'wrong'}],['issuer',{iss:'https://attacker.example'}],['audience',{aud:'other-client'}],['expiry',{exp:1}],['auth freshness',{auth_time:1}],['signature',{},true]])test(`OIDC rejects invalid ${name}`,async()=>{
  const {provider,flow}=await scenario(change,badSignature);await assert.rejects(()=>provider.callback(new URL(`${origin}/auth/oidc/demo/callback?code=test&state=state`),flow));
});
test('OIDC rejects state mismatch and user cancellation before token exchange',async()=>{
  const {provider,flow,tokenCalls}=await scenario();
  await assert.rejects(()=>provider.callback(new URL(`${origin}/auth/oidc/demo/callback?code=test&state=wrong`),flow));
  await assert.rejects(()=>provider.callback(new URL(`${origin}/auth/oidc/demo/callback?error=access_denied&state=state`),flow));
  assert.equal(tokenCalls(),0);
});
