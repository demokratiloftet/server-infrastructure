import dns from "node:dns/promises";
const { address } = await dns.lookup(process.env.PDS_DOCKER_HOST || "pds", {
  family: 4,
});
if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address))
  throw new Error("PDS must resolve to a private Docker IPv4 address");
console.log(address);
