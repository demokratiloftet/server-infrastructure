import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createPds } from "../src/pds.ts";

test("PDS responses must have usable identity, record and reference shapes", async (t) => {
  let response: unknown = {};
  const server = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(response));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert(address && typeof address !== "string");
  const pds = createPds(`http://127.0.0.1:${address.port}`);
  response = { did: 42 };
  await assert.rejects(() => pds.resolve("synthetic.test"));
  response = { did: "did:plc:synthetic", accessJwt: 42 };
  await assert.rejects(() => pds.login("synthetic.test", "synthetic-only"));
  response = { records: "not-an-array" };
  await assert.rejects(() => pds.list("did:plc:synthetic", "test.record"));
  response = {
    uri: "at://did:plc:synthetic/test.record/key",
    cid: "test-cid",
    value: "not-an-object",
  };
  await assert.rejects(() =>
    pds.get("did:plc:synthetic", "test.record", "key"),
  );
  response = { uri: "at://did:plc:synthetic/test.record/key" };
  await assert.rejects(() =>
    pds.create(
      { did: "did:plc:synthetic", accessJwt: "synthetic-only" },
      "test.record",
      {},
    ),
  );
  await assert.rejects(
    () => pds.create({ did: "did:plc:synthetic" }, "test.record", {}),
    /Missing PDS authorization/,
  );
});
