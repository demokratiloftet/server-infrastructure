import type { Server } from "node:net";
export function port(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected TCP server");
  return address.port;
}
export const listen = (server: Server) =>
  new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () =>
      resolve("http://127.0.0.1:" + port(server)),
    );
  });
export const close = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
