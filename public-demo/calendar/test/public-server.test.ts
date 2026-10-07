import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

test("public calendar refuses anonymous records and shared admin controls", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "calendar-public-"));
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../src/server.js", import.meta.url))],
    {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        APP_ENV: "public-demo",
        APP_ORIGIN: "https://calendar.example",
        DEMO_ACCESS_KEY: "synthetic-".repeat(4),
        ISSUER_DID: "did:plc:abcdefghijklmnopqrstuvwx",
        ISSUER_PASSWORD: "synthetic",
        ORGANISER_PASSWORD: "synthetic",
        AUTH_DATA_DIR: directory,
        AUTH_ENCRYPTION_KEY: "ab".repeat(32),
        ATPROTO_PDS_ORIGIN: "https://pds.example",
        ATPROTO_PLC_URL: "https://plc.example",
        AUTH_FETCH_ROUTES_JSON: "{}",
        OIDC_PROVIDERS_JSON: "[]",
        IDENTITY_LOGIN_PROVIDERS_JSON: "[]",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(async () => {
    child.kill();
    await once(child, "exit");
    await rm(directory, { recursive: true, force: true });
  });
  let output = "";
  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Server startup timed out")),
      5000,
    );
    child.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("Server exited during startup"));
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /Listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
  });
  const call = (
    path: string,
    method = "GET",
    headers: Record<string, string> = {},
  ) =>
    new Promise<{ status: number; body: Record<string, unknown> }>(
      (resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port,
            path,
            method,
            headers: {
              host: "calendar.example",
              origin: "https://calendar.example",
              "content-type": "application/json",
              ...headers,
            },
          },
          (response) => {
            let text = "";
            response.on("data", (chunk) => (text += chunk));
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                body: JSON.parse(text),
              }),
            );
          },
        );
        req.on("error", reject);
        req.end(method === "POST" ? "{}" : undefined);
      },
    );
  const state = await call("/api/state");
  assert.equal(state.status, 200);
  assert.equal(state.body.loggedOut, true);
  assert.deepEqual(state.body.events, []);
  assert.equal((await call("/api/auth")).body.publicDemo, true);
  for (const route of [
    "/api/session",
    "/api/seed",
    "/api/grant",
    "/api/revoke",
  ])
    assert.equal((await call(route, "POST")).status, 404);
  assert.equal((await call("/api/events", "POST")).status, 401);
  assert.equal(
    (await call("/api/state", "GET", { host: "evil.example" })).status,
    403,
  );
  assert.equal(
    (await call("/api/events", "POST", { origin: "https://evil.example" }))
      .status,
    403,
  );
  // Malformed absolute URLs must not throw a second exception while logging.
  assert.equal((await call("http://[")).status, 503);
  assert.equal((await call("/health")).status, 200);
});
