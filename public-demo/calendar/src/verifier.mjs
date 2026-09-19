import { CLAIM } from './contracts.mjs';
// Trust is anchored to the configured issuer DID and a fixed, operator-controlled
// PDS transport. This is NOT independent repository-signature verification.
export function verifyClaim(record, { issuerDid, subjectDid, clubId, now = Date.now() }) {
  const denied = reason => ({ valid:false, reason });
  if (!record) return denied('missing');
  const prefix = `at://${issuerDid}/${CLAIM}/`;
  if (!record.uri?.startsWith(prefix) || !record.uri.slice(prefix.length) || record.uri.slice(prefix.length).includes('/')) return denied('untrusted-issuer');
  const v = record.value;
  if (v?.$type !== CLAIM || v.version !== 1 || v.demo !== true) return denied('invalid-schema');
  if (v.subject !== subjectDid) return denied('wrong-subject');
  if (v.clubId !== clubId) return denied('wrong-club');
  const issued = Date.parse(v.issuedAt), expires = Date.parse(v.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= issued) return denied('invalid-dates');
  if (expires <= now) return denied('expired');
  return {valid:true, reason:'active', uri:record.uri, cid:record.cid, expiresAt:v.expiresAt};
}
export async function readAuthority(pds, policy, reference) {
  try {
    if (reference) {
      const prefix = `at://${policy.issuerDid}/${CLAIM}/`;
      if (!reference.uri?.startsWith(prefix)) return {valid:false, reason:'untrusted-issuer'};
      const key = reference.uri.slice(prefix.length);
      if (!/^[a-zA-Z0-9._~:-]{1,512}$/.test(key)) return {valid:false, reason:'invalid-reference'};
      const record = await pds.get(policy.issuerDid, CLAIM, key);
      if (record.cid !== reference.cid) return {valid:false, reason:'changed'};
      return verifyClaim(record, policy);
    }
    const records = await pds.list(policy.issuerDid, CLAIM);
    const checks = records.map(r => verifyClaim(r, policy));
    return checks.find(c => c.valid) || {valid:false, reason: checks.some(c => c.reason === 'expired') ? 'expired' : 'missing'};
  } catch (error) {
    if (error.code === 'RecordNotFound') return {valid:false, reason:'revoked'};
    return {valid:false, reason:'unavailable'};
  }
}
