import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("a shared calendar refuses short administrator credentials before starting", () => {
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../src/server.js", import.meta.url))],
    {
      env: {
        ...process.env,
        APP_ENV: "vps",
        DEMO_ACCESS_KEY: "short",
        ISSUER_DID: "did:plc:synthetic",
      },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(child.status, 1);
  assert.match(child.stderr, /24\+ characters/);
});
