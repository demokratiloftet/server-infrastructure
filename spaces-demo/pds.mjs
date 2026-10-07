import {createHash, generateKeyPairSync, randomUUID, sign} from 'node:crypto';

export const SPACE_TYPE = 'no.demokratiloftet.demo.noticeboard';
export const COLLECTION = 'no.demokratiloftet.demo.notice';
export const failure = (status, message) => Object.assign(new Error(message), {status});
export function parseSpace(space) {
  const match = /^at:\/\/(did:plc:[a-z2-7]{24})\/space\/no\.demokratiloftet\.demo\.noticeboard\/([a-z0-9][a-z0-9-]{0,47})$/.exec(space);
  if (!match) throw failure(400, 'Invalid demo group link');
  return {did: match[1], name: match[2]};
}

// Standard ES256 DPoP proof; the PDS verifies the binding and replay protection.
// Keys and credentials never leave this backend. No credentials are cached.
export function proof(key, method, url, credential) {
  const target = new URL(url); target.search = ''; target.hash = '';
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = {jti: randomUUID(), htm: method, htu: target.href, iat: Math.floor(Date.now() / 1000)};
  if (credential) payload.ath = createHash('sha256').update(credential).digest('base64url');
  const input = encode({typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicKey.export({format: 'jwk'})}) + '.' + encode(payload);
  return input + '.' + sign('sha256', Buffer.from(input), {key: key.privateKey, dsaEncoding: 'ieee-p1363'}).toString('base64url');
}

export function createPds({url, publicOrigin, fetchImpl = fetch}) {
  const base = new URL(url);
  async function rpc(method, data = {}, session, write = false, headers = {}) {
    const target = new URL('/xrpc/' + method, base);
    if (!write) target.search = new URLSearchParams(data);
    const response = await fetchImpl(target, {
      method: write ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: {...(session && {authorization: 'Bearer ' + session.accessJwt}),
        ...(write && {'content-type': 'application/json'}), ...headers},
      ...(write && {body: JSON.stringify(data)}),
    });
    let size = 0; const chunks = [];
    if (response.body) for await (const part of response.body) {
      size += part.length;
      if (size > 1024 * 1024) throw failure(502, 'PDS response too large');
      chunks.push(part);
    }
    let result; try { result = size ? JSON.parse(Buffer.concat(chunks)) : {}; } catch { throw failure(502, 'Invalid PDS response'); }
    if (!response.ok) {
      // Do not echo upstream request details or credentials into browser errors.
      const status = response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 429 ? 429 : 400;
      throw Object.assign(failure(status, status === 401 ? 'Sign in again' : 'PDS refused the request'), {code: result.error});
    }
    return result;
  }
  async function credential(session, space) {
    parseSpace(space);
    const {token} = await rpc('com.atproto.space.getDelegationToken', {space}, session);
    const key = generateKeyPairSync('ec', {namedCurve: 'P-256'});
    const endpoint = '/xrpc/com.atproto.space.getSpaceCredential';
    const result = await rpc('com.atproto.space.getSpaceCredential', {space}, null, true, {
      authorization: 'Bearer ' + token, dpop: proof(key, 'POST', new URL(endpoint, publicOrigin)),
    });
    return async (method, data) => rpc(method, data, null, false, {
      authorization: 'DPoP ' + result.credential,
      dpop: proof(key, 'GET', new URL('/xrpc/' + method, publicOrigin), result.credential),
    });
  }
  return {rpc, credential};
}
