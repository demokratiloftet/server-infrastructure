// Demo convenience only. Never let request data select the subject receiving a grant.
export async function demoPermission({environment,auth,service,req,input}) {
  if(environment!=='local' && !(environment==='public-demo' && process.env.DEMO_SELF_SERVICE==='true'))throw Object.assign(new Error('Demo shortcut disabled'),{status:404});
  const user=auth.requireUser(req);
  if(!['grant','revoke'].includes(input?.action))throw Object.assign(new Error('Ugyldig demohandling'),{status:400});
  return service[input.action](input.clubId,user.did);
}
