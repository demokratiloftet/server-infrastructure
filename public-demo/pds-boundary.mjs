// These exceptions are operator-selected local services, not user-selected URLs.
export function privateFetch(strict,plain,config) {
  const metadata=new URL(config.calendar).origin+'/auth/client-metadata.json';
  const plc=new URL(config.plc).origin;
  return async (input,init={})=>{
    const r=new Request(input,init),u=new URL(r.url);
    const isMetadata=u.href===metadata;
    const isDid=u.origin===plc&&/^\/did(?::|%3A)plc(?::|%3A)[a-z2-7]{24}$/.test(u.pathname)&&!u.search;
    if(r.method!=='GET'||u.username||u.password||!(isMetadata||isDid))return strict(input,init);
    const result=await plain(r,{redirect:'error',signal:AbortSignal.any([r.signal,AbortSignal.timeout(8000)])});
    // Bound these small JSON documents before returning them to the provider.
    if(!result.ok)return result;
    const reader=result.body.getReader();let size=0;const chunks=[];
    try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw new Error('Private metadata too large');chunks.push(value);}}
    finally{await reader.cancel();}
    return new Response(Buffer.concat(chunks),{status:result.status,headers:result.headers});
  };
}
export function privateProxy(strict,local,appviewOrigin) {
  const origin=new URL(appviewOrigin).origin;
  const result={};
  for(const method of ['dispatch','request','stream','pipeline','connect','upgrade'])result[method]=(options,...args)=>{
    const u=new URL(String(options.origin));
    const allowed=u.origin===origin&&u.pathname==='/'&&!u.search&&!u.username&&!u.password&&
      /^\/xrpc\/app\.bsky\.[A-Za-z.]+(?:\?|$)/.test(options.path)&&['GET','HEAD','POST'].includes(options.method);
    return (allowed?local:strict)[method](options,...args);
  };
  result.close=async()=>{await Promise.all([strict.close(),local.close()]);};
  result.destroy=async()=>{await Promise.all([strict.destroy(),local.destroy()]);};
  return result;
}
