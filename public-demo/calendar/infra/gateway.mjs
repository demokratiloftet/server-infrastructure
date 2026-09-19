import net from 'node:net';
for(const [port,host] of [[3000,'172.30.83.10'],[3002,'172.30.83.11']]) {
  net.createServer(client=>{
    const upstream=net.connect({host,port});const close=()=>{client.destroy();upstream.destroy();};
    client.on('error',close);upstream.on('error',close);
    client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());
    client.pipe(upstream).pipe(client);
  }).listen(port,'0.0.0.0');
}
