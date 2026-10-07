import assert from "node:assert/strict";
import net from "node:net";
import dns from "node:dns/promises";
import { readFile, readdir } from "node:fs/promises";
const gateway = process.argv[2] === "gateway",
  idp = process.argv[2] === "idp";
function reachable(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    const done = (v: boolean) => {
      socket.destroy();
      resolve(v);
    };
    socket.setTimeout(900);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}
const shared = process.env.APP_ENV === "shared";
if (shared) {
  assert(
    (
      await fetch(
        process.env.ATPROTO_PDS_ORIGIN +
          "/.well-known/oauth-authorization-server",
      )
    ).ok,
  );
} else {
  assert(
    await reachable(
      idp ? "127.0.0.1" : gateway ? "172.30.83.10" : "172.30.83.2",
      idp ? 3002 : gateway ? 3000 : 2583,
    ),
  );
  if (!gateway && !idp) assert(await reachable("172.30.83.2", 2582));
  if (!idp) assert(await reachable("172.30.83.11", 3002));
}
const privateTargets: Array<[string, number]> = [
  ["172.30.83.2", 2583],
  ["172.30.83.2", 2582],
];
for (const [host, port] of [
  ["1.1.1.1", 443],
  ["8.8.8.8", 53],
  ["2606:4700:4700::1111", 443],
  ...(gateway || idp ? privateTargets : []),
] satisfies Array<[string, number]>)
  assert.equal(
    await reachable(host, port),
    false,
    `${host}:${port} must be blocked`,
  );
for (const server of ["127.0.0.11", "1.1.1.1"]) {
  const resolver = new dns.Resolver({ timeout: 500, tries: 1 });
  resolver.setServers([server]);
  await assert.rejects(() => resolver.resolve4("example.com"));
}
let found = false;
for (const pid of (await readdir("/proc")).filter((p) => /^\d+$/.test(p))) {
  try {
    const command = await readFile(`/proc/${pid}/cmdline`, "utf8");
    if (
      !command.includes(
        idp
          ? "/app/dist/src/demo-idp.js"
          : gateway
            ? "/app/dist/infra/gateway.js"
            : "/app/dist/src/server.js",
      )
    )
      continue;
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    assert.match(status, /CapEff:\s+0+\n/);
    assert.match(status, /CapBnd:\s+0+\n/);
    found = true;
  } catch (e) {
    if (!(e instanceof Error) || !("code" in e) || e.code !== "ENOENT") throw e;
  }
}
assert(found);
console.log(
  `PASS ${idp ? "demo-idp" : gateway ? "gateway" : "calendar"}: fixed upstream reachable; IPv4, IPv6, DNS and non-allowlisted egress blocked; app has no capabilities`,
);
