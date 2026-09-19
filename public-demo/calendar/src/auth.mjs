import {IdentityGateway} from '../packages/identity/gateway.mjs';
import {sandboxPdsProvisioner} from '../packages/identity/sandbox-pds.mjs';
import {AuthStore,OidcProvider,createAtprotoProvider,restrictedFetch,vippsDefinition} from '@loftet/auth';
export function createAuth(origin,environment) {
  const local=environment==='local';
  if(!local&&!process.env.AUTH_ENCRYPTION_KEY)throw new Error('Shared auth requires AUTH_ENCRYPTION_KEY');
  const store=new AuthStore(process.env.AUTH_DATA_DIR||'/data/auth',process.env.AUTH_ENCRYPTION_KEY);
  const pdsOrigin=process.env.ATPROTO_PDS_ORIGIN||(local?'http://localhost:2583':undefined);
  const plcUrl=process.env.ATPROTO_PLC_URL||(local?'http://localhost:2582':undefined);
  if(!pdsOrigin||!plcUrl)throw new Error('Configure ATPROTO_PDS_ORIGIN and ATPROTO_PLC_URL');
  const definitions=local?[{id:'demo',label:'Demo-identitet',demo:true,issuer:'http://127.0.0.1:3002',clientId:'loftet-local',clientSecret:'synthetic-local-client-secret',clientAuth:'client_secret_post',scopes:'openid profile'}]:JSON.parse(process.env.OIDC_PROVIDERS_JSON||'[]');
  if(process.env.VIPPS_CLIENT_ID || process.env.VIPPS_CLIENT_SECRET) {
    if(local)throw new Error('Real Vipps credentials are not allowed in the isolated local sandbox');
    if(definitions.some(p=>p.id==='vipps'))throw new Error('Configure Vipps once');
    definitions.push(vippsDefinition({environment:process.env.VIPPS_ENVIRONMENT||'test',clientId:process.env.VIPPS_CLIENT_ID,clientSecret:process.env.VIPPS_CLIENT_SECRET}));
  }
  const routes=local?{
    'http://localhost:2583':'http://172.30.83.2:2583',
    'http://localhost:2582':'http://172.30.83.2:2582',
    'http://127.0.0.1:3002':'http://172.30.83.11:3002',
  }:JSON.parse(process.env.AUTH_FETCH_ROUTES_JSON||'{}');
  const fetch=restrictedFetch(routes);
  const atproto=createAtprotoProvider({origin,store,fetch,pdsOrigin,plcUrl,allowHttp:local});
  const providers=definitions.map(definition=>new OidcProvider(definition,{origin,fetch,allowHttp:local}));
  return new IdentityGateway({store,atproto,providers,origin,
    entryProviders:local?['demo']:JSON.parse(process.env.IDENTITY_LOGIN_PROVIDERS_JSON||'[]'),
    provisioner:local?sandboxPdsProvisioner({fetch:(url,init)=>fetch(String(url).replace('http://127.0.0.1:2583',pdsOrigin),init)}):undefined,
  });
}
