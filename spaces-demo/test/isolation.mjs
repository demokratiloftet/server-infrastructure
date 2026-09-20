import assert from 'node:assert/strict';
import net from 'node:net';
import dns from 'node:dns/promises';
import dgram from 'node:dgram';
import {readFileSync, readdirSync} from 'node:fs';
const connect = (host, port) => new Promise(resolve => {
  const s = net.connect({host, port});
  const end = value => { s.destroy(); resolve(value); };
  s.on('connect', () => end(true)); s.on('error', () => end(false)); s.setTimeout(1000, () => end(false));
});
for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(await connect(ip, 443), false, 'External egress: ' + ip);
assert.equal(await connect('1.1.1.1', 53), false);
for (const name of ['bsky.social', 'plc.directory']) await assert.rejects(dns.lookup(name));
assert.equal(await connect('spaces-pds', 3000), true);
const packet = Buffer.from('000101000001000000000000047465737407696e76616c69640000010001', 'hex');
const escaped = await new Promise(resolve => {
  const s = dgram.createSocket('udp4');
  const timer = setTimeout(() => { s.close(); resolve(false); }, 1000);
  s.on('message', () => { clearTimeout(timer); s.close(); resolve(true); });
  s.on('error', () => { clearTimeout(timer); s.close(); resolve(false); });
  s.send(packet, 53, '1.1.1.1');
});
assert.equal(escaped, false, 'External UDP DNS');
let status = readFileSync('/proc/self/status', 'utf8');
if (process.argv.includes('gateway')) {
  const pid = readdirSync('/proc').filter(v => /^\d+$/.test(v)).find(v => {
    try { return readFileSync('/proc/' + v + '/cmdline', 'utf8').split('\0').includes('/demo/gateway.mjs'); } catch { return false; }
  });
  assert(pid, 'Running gateway process'); status = readFileSync('/proc/' + pid + '/status', 'utf8');
}
assert.match(status, /Uid:\s+1000\s/);
for (const cap of ['CapEff', 'CapBnd', 'CapAmb']) assert.match(status, new RegExp(cap + ':\\s+0+\\n'));
console.log('PASS private PDS reachable; external TCP, DNS and UDP denied; unprivileged execution.');
