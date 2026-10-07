import { CLAIM, recordSchema } from "./contracts.ts";
import type {
  Authority,
  Policy,
  RecordReference,
  PdsRecord,
} from "./contracts.ts";
interface AuthorityReader {
  get?(repo: string, collection: string, rkey: string): Promise<PdsRecord>;
  list?(repo: string, collection: string): Promise<PdsRecord[]>;
}
// Trust is anchored to the configured issuer DID and operator-controlled PDS.
// This demo does not independently verify repository signatures.
export function verifyClaim(
  input: unknown,
  { issuerDid, subjectDid, clubId, now = Date.now() }: Policy,
): Authority {
  const denied = (reason: string): Authority => ({ valid: false, reason });
  if (!input) return denied("missing");
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return denied("invalid-schema");
  const record = parsed.data,
    prefix = `at://${issuerDid}/${CLAIM}/`;
  if (
    !record.uri.startsWith(prefix) ||
    !record.uri.slice(prefix.length) ||
    record.uri.slice(prefix.length).includes("/")
  )
    return denied("untrusted-issuer");
  const v = record.value;
  if (v.$type !== CLAIM || v.version !== 1 || v.demo !== true)
    return denied("invalid-schema");
  if (v.subject !== subjectDid) return denied("wrong-subject");
  if (v.clubId !== clubId) return denied("wrong-club");
  if (typeof v.issuedAt !== "string" || typeof v.expiresAt !== "string")
    return denied("invalid-dates");
  const issued = Date.parse(v.issuedAt),
    expires = Date.parse(v.expiresAt);
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    issued > now ||
    expires <= issued
  )
    return denied("invalid-dates");
  if (expires <= now) return denied("expired");
  return {
    valid: true,
    reason: "active",
    uri: record.uri,
    cid: record.cid,
    expiresAt: v.expiresAt,
  };
}
export async function readAuthority(
  pds: AuthorityReader,
  policy: Policy,
  reference?: RecordReference,
): Promise<Authority> {
  try {
    if (reference) {
      const prefix = `at://${policy.issuerDid}/${CLAIM}/`;
      if (!reference.uri.startsWith(prefix))
        return { valid: false, reason: "untrusted-issuer" };
      const key = reference.uri.slice(prefix.length);
      if (!/^[a-zA-Z0-9._~:-]{1,512}$/.test(key))
        return { valid: false, reason: "invalid-reference" };
      if (!pds.get) throw new Error("Record reader unavailable");
      const record = await pds.get(policy.issuerDid, CLAIM, key);
      if (record.cid !== reference.cid)
        return { valid: false, reason: "changed" };
      return verifyClaim(record, policy);
    }
    if (!pds.list) throw new Error("Record listing unavailable");
    const checks = (await pds.list(policy.issuerDid, CLAIM)).map((record) =>
      verifyClaim(record, policy),
    );
    return (
      checks.find((check) => check.valid) || {
        valid: false,
        reason: checks.some((check) => check.reason === "expired")
          ? "expired"
          : "missing",
      }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "RecordNotFound"
    )
      return { valid: false, reason: "revoked" };
    return { valid: false, reason: "unavailable" };
  }
}
