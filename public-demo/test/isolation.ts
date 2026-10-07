// Run inside each Node service as its ordinary application user.
import assert from "node:assert/strict";
import net from "node:net";
import dns from "node:dns/promises";
import dgram from "node:dgram";
import { readFileSync, readdirSync } from "node:fs";
const canConnect = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(1200, () => done(false));
    s.on("connect", () => done(true));
    s.on("error", () => done(false));
  });
for (const target of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
  assert.equal(
    await canConnect(target, 443),
    false,
    "External TCP reachable: " + target,
  );
await assert.rejects(() => dns.lookup("bsky.social"));
await assert.rejects(() => dns.lookup("plc.directory"));
const local = await dns.lookup("pds.dev.demokratiloftet.no");
assert.match(local.address, /^10\.249\.9[01]\./);
// Direct DNS bypass must fail, as must a remote DNS-over-TCP connection.
assert.equal(await canConnect("1.1.1.1", 53), false);
const query = Buffer.from([
  0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 4, 116, 101, 115, 116, 7, 105, 110, 118,
  97, 108, 105, 100, 0, 0, 1, 0, 1,
]);
const answer = await new Promise((resolve) => {
  const s = dgram.createSocket("udp4");
  const timer = setTimeout(() => {
    s.close();
    resolve(false);
  }, 1200);
  s.on("message", () => {
    clearTimeout(timer);
    s.close();
    resolve(true);
  });
  s.on("error", () => {
    clearTimeout(timer);
    s.close();
    resolve(false);
  });
  s.send(query, 53, "1.1.1.1");
});
assert.equal(answer, false, "External UDP DNS reachable");
if (process.argv.includes("gateway")) {
  const processes = readdirSync("/proc")
    .filter((x) => /^\d+$/.test(x))
    .flatMap((pid) => {
      try {
        return [
          {
            pid,
            cmd: readFileSync("/proc/" + pid + "/cmdline", "utf8"),
            status: readFileSync("/proc/" + pid + "/status", "utf8"),
          },
        ];
      } catch {
        return [];
      }
    });
  const gateway = processes.find((x) =>
    x.cmd.includes("/demo/dist/gateway.js"),
  );
  assert(gateway);
  assert.match(gateway.status, /Uid:\s+1000\s/);
  for (const c of ["CapEff", "CapBnd", "CapAmb"])
    assert.match(gateway.status, new RegExp(c + ":\\s+0+\\n"));
}
console.log(
  "PASS external IPv4/IPv6 TCP, UDP DNS, external names denied; private DNS works" +
    (process.argv.includes("gateway")
      ? "; gateway runs without capabilities"
      : ""),
);
