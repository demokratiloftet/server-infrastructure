import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {vippsDefinition,OidcProvider} from '../packages/auth/index.mjs';

test('Vipps requires credentials and an explicit valid environment',()=>{
  assert.throws(()=>vippsDefinition());
  assert.throws(()=>vippsDefinition({clientId:'id',clientSecret:'secret',environment:'typo'}));
  assert.equal(vippsDefinition({clientId:'id',clientSecret:'secret'}).issuer,'https://apitest.vipps.no/access-management-1.0/access/');
  assert.equal(vippsDefinition({clientId:'id',clientSecret:'secret',environment:'production'}).issuer,'https://api.vipps.no/access-management-1.0/access/');
});
test('Vipps-shaped OIDC flow uses Basic auth, PKCE, minimal scope and verifies a signed identity',async()=>{
  const definition=vippsDefinition({clientId:'fixture-client',clientSecret:'fixture-secret'});
  const {issuer}=definition,origin='https://calendar.example';
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const jwk={...await exportJWK(publicKey),kid:'vipps-fixture',alg:'RS256',use:'sig'};
  let flow,tokenCalls=0;
  const fetch=async(input,init)=>{
    const url=String(input);
    if(url===issuer+'.well-known/openid-configuration')return Response.json({issuer,authorization_endpoint:issuer+'oauth2/auth',token_endpoint:issuer+'oauth2/token',jwks_uri:issuer+'.well-known/jwks.json',response_types_supported:['code'],subject_types_supported:['pairwise'],id_token_signing_alg_values_supported:['RS256'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['client_secret_basic']});
    if(url===issuer+'.well-known/jwks.json')return Response.json({keys:[jwk]});
    if(url===issuer+'oauth2/token'){
      tokenCalls++;
      assert.equal(new Headers(init.headers).get('authorization'),'Basic '+Buffer.from('fixture%2Dclient:fixture%2Dsecret').toString('base64'));
      const body=new URLSearchParams(init.body);
      assert.equal(body.get('code_verifier'),flow.verifier);
      assert.equal(body.get('redirect_uri'),origin+'/auth/oidc/vipps/callback');
      assert.equal(body.has('client_secret'),false);
      const now=Math.floor(Date.now()/1000);
      const token=await new SignJWT({sub:'synthetic-vipps-subject',nonce:flow.nonce,auth_time:now}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(issuer).setAudience(definition.clientId).setIssuedAt(now).setExpirationTime(now+300).sign(privateKey);
      return Response.json({access_token:'discard-this',token_type:'Bearer',id_token:token});
    }
    throw Error('Unexpected destination');
  };
  const provider=new OidcProvider(definition,{origin,fetch});
  flow={...await provider.start('browser-bound-state'),state:'browser-bound-state'};
  const url=new URL(flow.url);
  assert.equal(url.searchParams.get('scope'),'openid');
  assert.equal(url.searchParams.get('market'),'NO');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('max_age'),'300');
  assert.equal(url.searchParams.has('client_secret'),false);
  const identity=await provider.callback(new URL(origin+'/auth/oidc/vipps/callback?code=fixture&state=browser-bound-state'),flow);
  assert.equal(identity.issuer,issuer);assert.equal(identity.subject,'synthetic-vipps-subject');
  assert.equal(identity.access_token,undefined);assert.equal(tokenCalls,1);
});
