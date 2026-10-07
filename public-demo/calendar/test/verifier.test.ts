import type { PdsRecord } from "../src/contracts.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyClaim, readAuthority } from "../src/verifier.ts";
import { CLAIM, validateEvent } from "../src/contracts.ts";
const policy = {
  issuerDid: "did:plc:issuer",
  subjectDid: "did:plc:organiser",
  clubId: "fjord",
  now: Date.parse("2026-09-17T12:00:00Z"),
};
const fixture = (): PdsRecord => ({
  uri: `at://${policy.issuerDid}/${CLAIM}/test`,
  cid: "cid-one",
  value: {
    $type: CLAIM,
    version: 1,
    demo: true,
    subject: policy.subjectDid,
    clubId: "fjord",
    issuedAt: "2026-09-17T11:00:00Z",
    expiresAt: "2026-09-18T11:00:00Z",
  },
});
test("only the accepted issuer, subject, club, schema and time interval grant authority", () => {
  assert.equal(verifyClaim(fixture(), policy).valid, true);
  for (const [field, value, reason] of [
    ["subject", "did:plc:someone", "wrong-subject"],
    ["clubId", "marka", "wrong-club"],
    ["expiresAt", "2026-09-17T11:59:00Z", "expired"],
    ["issuedAt", "2027-01-01T00:00:00Z", "invalid-dates"],
    ["expiresAt", "nonsense", "invalid-dates"],
    ["demo", false, "invalid-schema"],
    ["version", 2, "invalid-schema"],
  ] satisfies Array<[string, unknown, string]>) {
    const r = fixture();
    r.value[field] = value;
    assert.equal(verifyClaim(r, policy).reason, reason);
  }
  const forged = fixture();
  forged.uri = forged.uri.replace("did:plc:issuer", "did:plc:attacker");
  forged.value.issuer = policy.issuerDid;
  assert.equal(verifyClaim(forged, policy).reason, "untrusted-issuer");
});
test("deleted, modified and unreachable claims fail closed", async () => {
  const reference = { uri: fixture().uri, cid: "cid-one" };
  assert.equal(
    (await readAuthority({ get: async () => fixture() }, policy, reference))
      .valid,
    true,
  );
  assert.equal(
    (
      await readAuthority(
        { get: async () => ({ ...fixture(), cid: "changed" }) },
        policy,
        reference,
      )
    ).reason,
    "changed",
  );
  assert.equal(
    (
      await readAuthority(
        {
          get: async () => {
            throw Object.assign(new Error(), { code: "RecordNotFound" });
          },
        },
        policy,
        reference,
      )
    ).reason,
    "revoked",
  );
  assert.equal(
    (
      await readAuthority(
        {
          list: async () => {
            throw new Error("offline");
          },
        },
        policy,
      )
    ).reason,
    "unavailable",
  );
});
test("event timestamps require explicit timezone and end after start", () => {
  const input = {
    name: "Test",
    description: "Description",
    location: "Oslo",
    clubId: "fjord",
    category: "Løping",
    startsAt: "2026-09-18T12:00:00Z",
    endsAt: "2026-09-18T13:00:00Z",
  };
  assert.equal(validateEvent(input).name, "Test");
  assert.throws(() => validateEvent({ ...input, endsAt: input.startsAt }));
  assert.throws(() =>
    validateEvent({ ...input, startsAt: "2026-09-18T12:00" }),
  );
  assert.throws(() => validateEvent({ ...input, clubId: "other" }));
});
