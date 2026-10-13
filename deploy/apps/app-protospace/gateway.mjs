// Fixed TCP ingress, no caller-selected destination and no Docker socket.
// Only this container joins the ingress network; app remains internal-only.
import net from "node:net";

const server = net.createServer((client) => {
  const upstream = net.createConnection({ host: "app", port: 3000 });
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
server.listen(3000, "0.0.0.0");
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
});
