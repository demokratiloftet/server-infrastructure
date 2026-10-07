import { createPds } from "./pds.ts";
import { readAuthority } from "./verifier.ts";
const [issuerDid, subjectDid, clubId] = process.argv.slice(2);
if (!issuerDid || !subjectDid || !clubId) {
  console.error(
    "Usage: PDS_URL=http://127.0.0.1:2583 npm run verify:claim -- <issuer-DID> <organiser-DID> <club-id>",
  );
  process.exit(2);
}
const result = await readAuthority(
  createPds(process.env.PDS_URL || "http://127.0.0.1:2583"),
  { issuerDid, subjectDid, clubId },
);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.valid ? 0 : 1;
