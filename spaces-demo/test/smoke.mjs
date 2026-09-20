// Only the disposable loopback fixture. Never point this at a live deployment.
import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const host = 'demo-calendar.dev.demokratiloftet.no';
const origin = 'https://' + host;
const ca = readFileSync(new URL('./.runtime/tls/cert.pem', import.meta.url));
function request(path, {body, cookie, originHeader = origin, targetHost = host} = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({hostname:'127.0.0.1', port:19443, servername:host, ca, path, method:body === undefined ? 'GET' : 'POST',
      headers:{host:targetHost, origin:originHeader, ...(cookie && {cookie}), ...(body !== undefined && {'content-type':'application/json'})}}, res => {
      let data = ''; res.on('data', part => data += part);
      res.on('end', () => { let value; try { value = JSON.parse(data); } catch { value = data; } resolve({status:res.statusCode, value, headers:res.headers}); });
    }); req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('Timeout'))); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function ok(path, options) {
  const result = await request(path, options);
  assert.equal(result.status, 200, path + ': ' + JSON.stringify(result.value));
  return result;
}
const suffix = randomBytes(4).toString('hex');
const users = {};
for (const role of ['owner', 'member', 'outsider']) {
  const username = role + suffix;
  const response = await ok('/spaces/api/signup', {body:{username, password:randomBytes(20).toString('hex')}});
  users[role] = {username, cookie:response.headers['set-cookie'][0].split(';')[0], did:response.value.did};
  assert.match(response.headers['set-cookie'][0], /Path=\/spaces; HttpOnly; Secure; SameSite=Strict/);
  assert.equal(response.value.accessJwt, undefined);
}
const owner = users.owner.cookie, member = users.member.cookie, outsider = users.outsider.cookie;
const group = (await ok('/spaces/api/groups', {cookie:owner, body:{name:'club-' + suffix}})).value.uri;
const query = '/spaces/api/group?space=' + Buffer.from(group).toString('base64url');
assert.equal((await request(query)).status, 401);
assert.notEqual((await request(query, {cookie:member})).status, 200);
await ok('/spaces/api/notices', {cookie:owner, body:{space:group, text:'Synthetic private meeting'}});
await ok('/spaces/api/members', {cookie:owner, body:{space:group, username:users.member.username, remove:false}});
const read = await ok(query, {cookie:member});
assert.equal((await request(query, {cookie:member, originHeader:'https://demo-social.dev.demokratiloftet.no'})).status, 403, 'Another demo frontend must not read the Spaces session');
assert.equal(read.value.records[0].value.text, 'Synthetic private meeting');
assert.equal(read.value.owner, false); assert.equal(read.value.members, undefined);
assert.notEqual((await request(query, {cookie:outsider})).status, 200);
assert.equal((await request('/spaces/api/notices', {cookie:member, body:{space:group, text:'Not permitted'}})).status, 403);
assert.equal((await request('/spaces/api/members', {cookie:member, body:{space:group, username:users.outsider.username, remove:false}})).status, 403);
await ok('/spaces/api/members', {cookie:owner, body:{space:group, username:users.member.username, remove:true}});
assert.notEqual((await request(query, {cookie:member})).status, 200, 'Removed member must lose access on next read');
assert.equal((await request('/spaces/api/notices', {cookie:owner, originHeader:'https://external.invalid', body:{space:group,text:'CSRF'}})).status, 403);
for (const path of ['/spaces/xrpc/com.atproto.sync.getRepo','/spaces/api/proxy','/spaces/%2e%2e/xrpc/com.atproto.space.listRecords','/xrpc/com.atproto.space.listRecords','/xrpc/com.atproto.space.getRepo']) {
  assert.equal((await request(path, {cookie:owner})).status, 404);
}
assert.equal((await request('/', {targetHost:'spaces-pds.dev.demokratiloftet.no'})).status, 404);
await ok('/spaces/api/logout', {cookie:owner, body:{}});
assert.equal((await request(query, {cookie:owner})).status, 401);
console.log('PASS real alpha PDS: signup, group, notice, member read, outsider refusal, owner-only changes, removal, logout, CSRF and public route isolation.');
