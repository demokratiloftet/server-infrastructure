// Vipps Login identity linking; does not replace AT Protocol repository authorization.
export function vippsDefinition({environment='test',clientId,clientSecret}={}) {
  if(!['test','production'].includes(environment))throw new Error('Vipps environment must be test or production');
  if(typeof clientId!=='string'||!clientId.trim()||typeof clientSecret!=='string'||!clientSecret.trim())throw new Error('Vipps Login requires registered client credentials');
  return {
    id:'vipps',label:environment==='test'?'Vipps (test)':'Vipps',
    issuer:`https://${environment==='test'?'apitest':'api'}.vipps.no/access-management-1.0/access/`,
    clientId,clientSecret,clientAuth:'client_secret_basic',scopes:'openid',
    idTokenAlgorithm:'RS256',market:'NO',
  };
}
