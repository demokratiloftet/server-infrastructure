import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createPds, parseSpace} from '../pds.mjs';
import {createGateway} from '../../public-demo/gateway.mjs';

test('PDS adapter handles empty success, refuses redirects, bounds responses and hides upstream details', async () => {
  const requests = [];
  let response = new Response(null, {status:200});
  const pds = createPds({url:'http://pds.invalid', publicOrigin:'https://pds.invalid', fetchImpl:async (url, options) => { requests.push({url, options}); return response; }});
  assert.deepEqual(await pds.rpc('com.atproto.simplespace.putMember', {}, {accessJwt:'secret'}, true), {});
  assert.equal(requests[0].url.origin, 'http://pds.invalid');
  assert.equal(requests[0].options.redirect, 'error');
  response = new Response(JSON.stringify({error:'Forbidden', message:'sensitive upstream detail'}), {status:403});
  await assert.rejects(pds.rpc('com.atproto.space.listRecords'), e => e.status === 403 && !e.message.includes('sensitive'));
  response = new Response('x'.repeat(1024 * 1024 + 1));
  await assert.rejects(pds.rpc('com.atproto.space.listRecords'), /too large/);
  for (const uri of ['https://external.invalid', 'at://did:web:external.invalid/space/no.demokratiloftet.demo.noticeboard/test', 'at://did:plc:abcdefghijklmnopqrstuvwx/space/com.other.space/test']) assert.throws(() => parseSpace(uri));
});

test('Spaces gateway is opt-in, exact-route only, and forwards no browser-selected destination', async () => {
  let calls = 0, headers;
  const upstream = http.createServer((req, res) => { calls++; headers = req.headers; res.end('{}'); });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + upstream.address().port;
  const config = {socialHost:'social.demo.test', calendarHost:'calendar.demo.test', pdsHost:'pds.demo.test', cookieDomain:'demo.test', pds:base, calendar:base, staticDir:'/not-present'};
  const servers = [];
  async function request(enabled, path, host = config.calendarHost) {
    const server = http.createServer(createGateway({...config, ...(enabled && {spaces:base})}).handler);
    servers.push(server); await new Promise(r => server.listen(0, '127.0.0.1', r));
    return new Promise((resolve, reject) => {
      const req = http.get({hostname:'127.0.0.1', port:server.address().port, path, headers:{host, authorization:'Bearer must-not-pass', 'atproto-proxy':'did:web:external.invalid', cookie:'__Secure-loftet-spaces=session'}}, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject);
    });
  }
  try {
    assert.equal(await request(false, '/spaces/'), 404); assert.equal(calls, 0);
    assert.equal(await request(true, '/spaces/'), 200); assert.equal(calls, 1);
    assert.equal(headers.authorization, undefined); assert.equal(headers['atproto-proxy'], undefined);
    for (const path of ['/spaces/xrpc/com.atproto.space.getRepo', '/spaces/api/proxy', '/spaces/api/groups', '/spaces/%2e%2e/xrpc/com.atproto.sync.getRepo']) assert.equal(await request(true, path), 404);
    assert.equal(await request(true, '/spaces/', 'spaces-pds.demo.test'), 404);
    assert.equal(calls, 1);
  } finally { await Promise.all([upstream, ...servers].map(s => new Promise(r => s.close(r)))); }
});
