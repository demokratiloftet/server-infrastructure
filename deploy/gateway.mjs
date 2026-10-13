// Root-owned fixed destinations: callers cannot choose a host, port or URL.
import net from "node:net";
const servers = [];
function forward(port, host, targetPort) {
  const server = net.createServer((client) => {
    const upstream = net.createConnection({ host, port: targetPort });
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.setTimeout(60_000, close);
    upstream.setTimeout(60_000, close);
    client.on("error", close);
    upstream.on("error", close);
    client.on("close", close);
    upstream.on("close", close);
    client.pipe(upstream).pipe(client);
  });
  server.maxConnections = 64;
  server.listen(port, "0.0.0.0");
  servers.push(server);
}
forward(3000, process.env.UPSTREAM_HOST ?? "app", 3000);
if (process.env.PDS_PROXY === "true") forward(3001, "hackathon-pds", 3000);
process.on("SIGTERM", () => {
  for (const server of servers) server.close();
  setTimeout(() => process.exit(0), 5000).unref();
});
