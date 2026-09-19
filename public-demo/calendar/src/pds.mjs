export class PdsError extends Error {
  constructor(code, status) { super(`PDS: ${code}`); this.code = code; this.status = status; }
}
export function createPds(base) {
  const origin = new URL(base);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') throw new Error('PDS_URL must be an HTTP(S) origin');
  async function rpc(method, data, token, write = false) {
    const url = new URL(`/xrpc/${method}`, origin);
    if (!write) url.search = new URLSearchParams(data);
    const response = await fetch(url, {
      method: write ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { ...(write && {'content-type':'application/json'}), ...(token && {authorization:`Bearer ${token}`}) },
      ...(write && { body: JSON.stringify(data) }),
    });
    const result = await response.json();
    if (!response.ok) throw new PdsError(result.error || 'Unavailable', response.status);
    return result;
  }
  return {
    rpc,
    login: (identifier, password) => rpc('com.atproto.server.createSession', {identifier, password}, null, true),
    resolve: async handle => (await rpc('com.atproto.repo.describeRepo', {repo:handle})).did,
    get: (repo, collection, rkey) => rpc('com.atproto.repo.getRecord', {repo, collection, rkey}),
    async list(repo, collection) {
      const records = []; let cursor;
      do {
        const page = await rpc('com.atproto.repo.listRecords', {repo, collection, limit:'100', ...(cursor && {cursor})});
        records.push(...page.records); cursor = page.cursor;
        if (records.length > 10000) throw new Error('Demo repository is too large');
      } while (cursor);
      return records;
    },
    async create(session, collection, record) {
      const payload={repo:session.did,collection,record,validate:false};
      if(session.fetchHandler) {
        const response=await session.fetchHandler('/xrpc/com.atproto.repo.createRecord',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
        const result=await response.json();if(!response.ok)throw new PdsError(result.error||'Unavailable',response.status);return result;
      }
      return rpc('com.atproto.repo.createRecord',payload,session.accessJwt,true);
    },
    remove: (session, collection, rkey) => rpc('com.atproto.repo.deleteRecord', {repo:session.did, collection, rkey}, session.accessJwt, true),
  };
}
