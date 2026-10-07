import { z } from "zod";
import dns from "node:dns/promises";
import { readFileSync } from "node:fs";
// Shared sandbox: pin reviewed HTTPS destinations to private/tailnet addresses at
// startup so runtime DNS can remain disabled. Public provider integration uses a
// separate reviewed deployment boundary, not a broad egress exception here.
const routes = z
  .record(z.string(), z.string())
  .parse(JSON.parse(process.env.AUTH_FETCH_ROUTES_JSON || "{}"));
const allowedPrivate = (ip: string) =>
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
    ip,
  );
for (const [source, target] of Object.entries(routes)) {
  const origin = new URL(source);
  if (
    origin.origin !== source ||
    target !== source ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password
  )
    throw new Error("Shared auth requires HTTPS origins without rewrites");
  const { address } = await dns.lookup(origin.hostname, { family: 4 });
  if (!allowedPrivate(address))
    throw new Error(
      "Shared sandbox auth endpoints must resolve to reviewed private/tailnet IPv4 addresses",
    );
  const pinned = readFileSync("/etc/hosts", "utf8")
    .split("\n")
    .some((line) => {
      const [ip, ...hosts] = line.trim().split(/\s+/);
      return ip === address && hosts.includes(origin.hostname);
    });
  if (!pinned)
    throw new Error(
      "Auth destinations must be pinned using Docker extra_hosts",
    );
  console.log(`${address} ${origin.port || 443}`);
}
