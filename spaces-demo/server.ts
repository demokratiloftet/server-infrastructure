import { z } from "zod";
import type { Pds } from "./pds.ts";
import type { Session } from "./protocol.ts";
import { errorStatus, errorMessage } from "./errors.ts";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createPds,
  parseSpace,
  failure,
  SPACE_TYPE,
  COLLECTION,
} from "./pds.ts";

export function createApp({
  origin,
  pds,
  pdsHost,
  clock = Date.now,
}: {
  origin: string;
  pds: Pds;
  pdsHost: string;
  clock?: () => number;
}) {
  const canonical = new URL(origin);
  const sessions = new Map<string, Session & { until: number }>();
  const cookieName = "__Secure-loftet-spaces";
  const cookie = (value: string) =>
    `${cookieName}=${value}; Path=/spaces; HttpOnly; Secure; SameSite=Strict; Max-Age=${value ? 7200 : 0}`;
  function text(value: unknown, max: number) {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw failure(400, "Check the entered value");
    return value.trim();
  }
  function handle(value: unknown) {
    const name = text(value, 32).toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(name))
      throw failure(
        400,
        "Use a short username with letters, numbers or hyphens",
      );
    return name + "." + pdsHost;
  }
  function sessionId(req: http.IncomingMessage) {
    return (
      (req.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1) || ""
    );
  }
  async function json(
    req: http.IncomingMessage,
  ): Promise<Record<string, unknown>> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const part of req) {
      size += part.length;
      if (size > 8192) throw failure(413, "Request too large");
      chunks.push(part);
    }
    try {
      return z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      throw failure(400, "Invalid JSON");
    }
  }
  async function auth(req: http.IncomingMessage) {
    const session = sessions.get(sessionId(req));
    if (!session || session.until <= clock())
      throw failure(401, "Sign in first");
    // Revalidate on every request: account deletion and revoked sessions fail closed.
    await pds.rpc("com.atproto.server.getSession", {}, session);
    return session;
  }
  async function owner(session: Session, space: string) {
    if (parseSpace(space).did !== session.did)
      throw failure(403, "Only the group owner can do this");
  }
  async function handler(req: http.IncomingMessage, res: http.ServerResponse) {
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", "application/json");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "content-security-policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const send = (data: unknown) => res.end(JSON.stringify(data));
    try {
      if (req.headers.host !== canonical.host) throw failure(404, "Not found");
      if (req.headers.origin && req.headers.origin !== canonical.origin)
        throw failure(403, "Use the Spaces frontend");
      if (req.method === "GET" && req.url === "/health")
        return send({ ok: true });
      if (
        !req.url ||
        !req.url.startsWith("/spaces/") ||
        req.url.includes("%") ||
        req.url.includes("\\")
      )
        throw failure(404, "Not found");
      const u = new URL(req.url, origin),
        path = u.pathname;
      if (
        req.method === "GET" &&
        ["/spaces/", "/spaces/app.js", "/spaces/style.css"].includes(path) &&
        !u.search
      ) {
        const file =
          path === "/spaces/" ? "index.html" : path.split("/").at(-1)!;
        res.setHeader(
          "content-type",
          file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : file.endsWith(".js")
              ? "text/javascript"
              : "text/css",
        );
        return res.end(
          await readFile(new URL("./public/" + file, import.meta.url)),
        );
      }
      if (!["GET", "POST"].includes(req.method || ""))
        throw failure(405, "Method not allowed");
      if (
        req.method === "POST" &&
        (req.headers.origin !== canonical.origin ||
          !req.headers["content-type"]?.startsWith("application/json"))
      )
        throw failure(403, "Same-origin JSON required");
      const input = req.method === "POST" ? await json(req) : {};
      for (const [id, value] of sessions)
        if (value.until <= clock()) sessions.delete(id);
      if (
        req.method === "POST" &&
        ["/spaces/api/login", "/spaces/api/signup"].includes(path)
      ) {
        if (sessions.size >= 1000)
          throw failure(503, "Too many active sessions");
        const identifier = handle(input.username),
          password = text(input.password, 256);
        if (password.length < 12)
          throw failure(400, "Use at least 12 characters for the password");
        const signup = path.endsWith("/signup");
        const account = await pds.rpc(
          signup
            ? "com.atproto.server.createAccount"
            : "com.atproto.server.createSession",
          signup
            ? {
                handle: identifier,
                password,
                email: identifier.split(".")[0] + "@example.invalid",
              }
            : { identifier, password },
          null,
          true,
        );
        const id = randomBytes(32).toString("hex");
        sessions.delete(sessionId(req));
        sessions.set(id, {
          did: account.did,
          handle: account.handle,
          accessJwt: account.accessJwt,
          until: clock() + 7200000,
        });
        res.setHeader("set-cookie", cookie(id));
        return send({
          did: account.did,
          username: account.handle.split(".")[0],
        });
      }
      if (req.method === "POST" && path === "/spaces/api/logout") {
        const id = sessionId(req);
        sessions.delete(id);
        res.setHeader("set-cookie", cookie(""));
        return send({ ok: true });
      }
      const session = await auth(req);
      if (req.method === "GET" && path === "/spaces/api/me")
        return send({
          did: session.did,
          username: session.handle.split(".")[0],
        });
      if (req.method === "POST" && path === "/spaces/api/groups") {
        const name = text(input.name, 48);
        if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(name))
          throw failure(
            400,
            "Use lowercase letters, numbers and hyphens for the group name",
          );
        return send(
          await pds.rpc(
            "com.atproto.simplespace.createSpace",
            {
              type: SPACE_TYPE,
              skey: name,
              readPolicy: {
                $type: "com.atproto.simplespace.defs#memberListPolicy",
              },
              writePolicy: {
                $type: "com.atproto.simplespace.defs#memberListPolicy",
              },
              appAccess: { $type: "com.atproto.simplespace.defs#open" },
            },
            session,
            true,
          ),
        );
      }
      // GET uses a base64url URI so the public gateway can reject encoded paths.
      const space =
        req.method === "GET"
          ? Buffer.from(
              u.searchParams.get("space") || "",
              "base64url",
            ).toString()
          : text(input.space, 1024);
      const group = parseSpace(space);
      if (req.method === "GET" && path === "/spaces/api/group") {
        // Obtain a fresh native space credential on EVERY read. Never use an
        // owner's session to serve another member and never retain group data.
        const read = await pds.credential(session, space);
        const page = await read("com.atproto.space.listRecords", {
          space,
          repo: group.did,
          collection: COLLECTION,
          limit: "50",
          reverse: "true",
        });
        const members =
          group.did === session.did
            ? await pds.rpc(
                "com.atproto.simplespace.listMembers",
                { space, limit: "100" },
                session,
              )
            : undefined;
        return send({
          name: group.name,
          owner: group.did === session.did,
          records: page.records,
          more: Boolean(page.cursor),
          members: members?.members,
        });
      }
      await owner(session, space);
      if (req.method === "POST" && path === "/spaces/api/notices") {
        return send(
          await pds.rpc(
            "com.atproto.space.createRecord",
            {
              space,
              repo: session.did,
              collection: COLLECTION,
              validate: false,
              record: {
                $type: COLLECTION,
                text: text(input.text, 2000),
                createdAt: new Date(clock()).toISOString(),
                demo: true,
              },
            },
            session,
            true,
          ),
        );
      }
      if (req.method === "POST" && path === "/spaces/api/members") {
        const member = await pds.rpc("com.atproto.repo.describeRepo", {
          repo: handle(input.username),
        });
        if (member.did === session.did)
          throw failure(400, "The owner already has access");
        if (typeof input.remove !== "boolean")
          throw failure(400, "Choose add or remove");
        await pds.rpc(
          input.remove
            ? "com.atproto.simplespace.removeMember"
            : "com.atproto.simplespace.putMember",
          {
            space,
            did: member.did,
            ...(!input.remove && { read: true, write: false }),
          },
          session,
          true,
        );
        return send({ ok: true });
      }
      throw failure(404, "Not found");
    } catch (e) {
      res.statusCode = errorStatus(e) || 503;
      send({
        error: errorStatus(e)
          ? errorMessage(e)
          : "Spaces is unavailable; please try again",
      });
    }
  }
  return { handler };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { SPACES_APP_ORIGIN: origin, SPACES_PDS_HOST: pdsHost } = process.env;
  if (!origin?.startsWith("https://") || !pdsHost)
    throw new Error("Configure HTTPS app origin and private PDS hostname");
  const pds = createPds({
    url: "http://spaces-pds:3000",
    publicOrigin: "https://" + pdsHost,
  });
  const server = http.createServer(createApp({ origin, pds, pdsHost }).handler);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on("upgrade", (_req, socket) => socket.destroy());
  server.listen(3000, "0.0.0.0");
}
