// Disposable staging only: canonical HTTPS names backed by fixed test services.
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
const hosts: Record<string, [string, number]> = {
  pds: ["pds", 3000],
  plc: ["plc", 3000],
  bsky: ["bsky", 2584],
  relay: ["relay", 3000],
  jetstream: ["jetstream", 6008],
  feedgen: ["feedgen", 3000],
  ozone: ["ozone", 3000],
  social: ["social", 8100],
  "demo-calendar": ["public-calendar", 3000],
};
const server = https.createServer(
  { key: readFileSync("/tls/key.pem"), cert: readFileSync("/tls/cert.pem") },
  (req, res) => {
    const prefix = req.headers.host?.split(".")[0];
    if (prefix === "traefik") {
      res.end("ok");
      return;
    }
    const target = hosts[prefix || ""];
    if (!target) {
      res.writeHead(404);
      return res.end();
    }
    const r = http.request(
      {
        host: target[0],
        port: target[1],
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (s) => {
        res.writeHead(s.statusCode || 502, s.headers);
        s.pipe(res);
      },
    );
    r.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(r);
  },
);
server.on("upgrade", (req, client, head) => {
  const target = hosts[req.headers.host?.split(".")[0] || ""];
  if (!target) return client.destroy();
  const r = http.request({
    host: target[0],
    port: target[1],
    path: req.url,
    headers: req.headers,
  });
  r.on("upgrade", (res, socket, buffer) => {
    client.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        Object.entries(res.headers)
          .map(([k, v]) => k + ": " + v + "\r\n")
          .join("") +
        "\r\n",
    );
    if (buffer.length) client.write(buffer);
    if (head.length) socket.write(head);
    client.pipe(socket).pipe(client);
    client.on("error", () => socket.destroy());
    socket.on("error", () => client.destroy());
  });
  r.on("response", () => client.destroy());
  r.on("error", () => client.destroy());
  r.end();
});
server.listen(443, "0.0.0.0");
