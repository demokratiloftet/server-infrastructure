import dgram from 'node:dgram';
import net from 'node:net';
function question(packet) {
  if(packet.length<12||packet.readUInt16BE(4)!==1)return null;
  let offset=12;const labels=[];
  while(offset<packet.length){const n=packet[offset++];if(n===0)break;if(n>63||offset+n>packet.length)return null;labels.push(packet.subarray(offset,offset+n).toString('ascii').toLowerCase());offset+=n;}
  if(offset+4>packet.length||packet.readUInt16BE(offset+2)!==1)return null;
  return {name:labels.join('.'),type:packet.readUInt16BE(offset),end:offset+4};
}
export function answer(packet,records,txt) {
  const q=question(packet);if(!q)return null;
  const ip=records[q.name];
  const header=Buffer.alloc(12);packet.copy(header,0,0,2);header.writeUInt16BE(ip||txt?0x8500:0x8503,2);header.writeUInt16BE(1,4);
  let payload=Buffer.alloc(0);
  if(ip&&q.type===1){header.writeUInt16BE(1,6);payload=Buffer.from([0xc0,0x0c,0,1,0,1,0,0,0,30,0,4,...ip.split('.').map(Number)]);}
  if(txt&&q.type===16){const value=Buffer.from(txt);if(value.length>255)return null;header.writeUInt16BE(1,6);payload=Buffer.from([0xc0,0x0c,0,16,0,1,0,0,0,30,0,value.length+1,value.length,...value]);}
  return Buffer.concat([header,packet.subarray(12,q.end),payload]);
}
export async function resolveAnswer(packet,records,fetcher=fetch) {
  const q=question(packet);if(!q)return null;
  // Local handle proof is served only for this PDS's account namespace. There
  // is no DNS forwarding and the HTTP destination cannot come from the query.
  const pdsDomain=Object.keys(records).find(k=>k.startsWith('pds.'));
  const handle=q.name.startsWith('_atproto.')?q.name.slice(9):'';
  if(q.type===16&&pdsDomain&&handle.endsWith('.'+pdsDomain)&&/^[a-z0-9-]+$/.test(handle.slice(0,-pdsDomain.length-1))){
    try{
      const r=await fetcher('http://'+records.pds+':3000/xrpc/com.atproto.identity.resolveHandle?'+new URLSearchParams({handle}),{redirect:'error',signal:AbortSignal.timeout(2000)});
      if(r.ok){const {did}=await r.json();if(/^did:plc:[a-z2-7]{24}$/.test(did))return answer(packet,records,'did='+did);}
    }catch{/* Unavailable account proof fails closed. */}
  }
  return answer(packet,records);
}
if(process.env.DEMO_DNS_RECORDS){
  const records=JSON.parse(process.env.DEMO_DNS_RECORDS),udp=dgram.createSocket('udp4');
  udp.on('message',async(p,r)=>{const a=await resolveAnswer(p,records);if(a)udp.send(a,r.port,r.address);});udp.bind(53,'0.0.0.0');
  net.createServer(s=>{let b=Buffer.alloc(0);s.setTimeout(3000,()=>s.destroy());s.on('data',async x=>{b=Buffer.concat([b,x]);if(b.length>4096)return s.destroy();if(b.length>=2&&b.length===b.readUInt16BE(0)+2){const a=await resolveAnswer(b.subarray(2),records);if(!a)return s.destroy();const n=Buffer.alloc(2);n.writeUInt16BE(a.length);s.end(Buffer.concat([n,a]));}});}).listen(53,'0.0.0.0');
}
