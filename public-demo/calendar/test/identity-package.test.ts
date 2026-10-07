import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityGateway } from "@loftet/identity";
import { createAuth } from "../src/auth.ts";

test("calendar composes the installed standalone identity package with its isolated provider", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "calendar-identity-package-"));
  const previous = process.env.AUTH_DATA_DIR;
  process.env.AUTH_DATA_DIR = directory;
  let auth: ReturnType<typeof createAuth> | undefined;
  t.after(() => {
    auth?.store.close();
    if (previous === undefined) delete process.env.AUTH_DATA_DIR;
    else process.env.AUTH_DATA_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  });
  auth = createAuth("http://127.0.0.1:3000", "local");
  assert(auth instanceof IdentityGateway);
  assert.deepEqual(
    auth.state({ headers: {} }).entryProviders.map((p) => p.id),
    ["demo"],
  );
  assert(auth.provisioner?.choices);
  assert.deepEqual(auth.provisioner.choices({ provider: "demo" }), [
    { domain: "test" },
  ]);
  assert(auth.provisioner?.choices);
  assert.deepEqual(auth.provisioner.choices({ provider: "untrusted" }), []);
});
