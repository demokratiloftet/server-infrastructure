import assert from "node:assert/strict";
import { z } from "zod";
const container = z.object({
  NetworkSettings: z.object({ Networks: z.record(z.string(), z.unknown()) }),
  HostConfig: z.object({
    PortBindings: z
      .record(z.string(), z.array(z.object({ HostIp: z.string() })))
      .nullish(),
    ReadonlyRootfs: z.boolean(),
  }),
  Mounts: z.array(z.object({ Source: z.string() })),
});
let input = "";
for await (const chunk of process.stdin) input += chunk;
const [app, gateway, idp] = z
  .tuple([container, container, container])
  .parse(JSON.parse(input));
for (const service of [app, idp]) {
  assert.equal(Object.keys(service.NetworkSettings.Networks).length, 1);
  assert(service.NetworkSettings.Networks["loftet-isolated-sandbox_isolated"]);
  assert.equal(Object.keys(service.HostConfig.PortBindings || {}).length, 0);
}
assert.equal(
  gateway.HostConfig.PortBindings?.["3000/tcp"]?.[0]?.HostIp,
  "127.0.0.1",
);
assert.equal(
  gateway.HostConfig.PortBindings?.["3002/tcp"]?.[0]?.HostIp,
  "127.0.0.1",
);
for (const service of [app, gateway, idp]) {
  assert(service.HostConfig.ReadonlyRootfs);
  assert(!service.Mounts.some((mount) => mount.Source.includes("docker.sock")));
}
console.log(
  "PASS app topology, loopback ingress, read-only roots, no Docker socket",
);
