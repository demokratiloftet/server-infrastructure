import { z } from "zod";
import { rpcSchemas } from "./protocol.ts";
import type {
  DpopKey,
  Session,
  RpcMethod,
  RpcResults,
  Read,
} from "./protocol.ts";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";

export const SPACE_TYPE = "no.demokratiloftet.demo.noticeboard";
export const COLLECTION = "no.demokratiloftet.demo.notice";
export const failure = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
export function parseSpace(space: string) {
  const match =
    /^at:\/\/(did:plc:[a-z2-7]{24})\/space\/no\.demokratiloftet\.demo\.noticeboard\/([a-z0-9][a-z0-9-]{0,47})$/.exec(
      space,
    );
  if (!match) throw failure(400, "Invalid demo group link");
  return { did: match[1], name: match[2] };
}

// Standard ES256 DPoP proof; the PDS verifies the binding and replay protection.
// Keys and credentials never leave this backend. No credentials are cached.
export function proof(
  key: DpopKey,
  method: string,
  url: string | URL,
  credential?: string,
) {
  const target = new URL(url);
  target.search = "";
  target.hash = "";
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload: {
    jti: string;
    htm: string;
    htu: string;
    iat: number;
    ath?: string;
  } = {
    jti: randomUUID(),
    htm: method,
    htu: target.href,
    iat: Math.floor(Date.now() / 1000),
  };
  if (credential)
    payload.ath = createHash("sha256").update(credential).digest("base64url");
  const input =
    encode({
      typ: "dpop+jwt",
      alg: "ES256",
      jwk: key.publicKey.export({ format: "jwk" }),
    }) +
    "." +
    encode(payload);
  return (
    input +
    "." +
    sign("sha256", Buffer.from(input), {
      key: key.privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url")
  );
}

export function createPds({
  url,
  publicOrigin,
  fetchImpl = fetch,
}: {
  url: string;
  publicOrigin: string;
  fetchImpl?: typeof fetch;
}) {
  const base = new URL(url);
  async function rpc<M extends RpcMethod>(
    method: M,
    data: Record<string, unknown> = {},
    session?: Session | null,
    write = false,
    headers: Record<string, string> = {},
  ): Promise<RpcResults[M]> {
    const target = new URL("/xrpc/" + method, base);
    if (!write)
      target.search = new URLSearchParams(
        Object.entries(data).map(([name, value]) => [name, String(value)]),
      ).toString();
    const options: RequestInit = {
      method: write ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        ...(session?.accessJwt && {
          authorization: "Bearer " + session.accessJwt,
        }),
        ...(write && { "content-type": "application/json" }),
        ...headers,
      },
      ...(write && { body: JSON.stringify(data) }),
    };
    const response = await fetchImpl(target, options);
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (response.body)
      for await (const part of response.body) {
        size += part.length;
        if (size > 1024 * 1024) throw failure(502, "PDS response too large");
        chunks.push(part);
      }
    let result: Record<string, unknown>;
    try {
      result = z
        .record(z.string(), z.unknown())
        .parse(size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
    } catch {
      throw failure(502, "Invalid PDS response");
    }
    if (!response.ok) {
      // Do not echo upstream request details or credentials into browser errors.
      const status = [
        "UserNotAuthorized",
        "NotAuthorized",
        "SpaceDeleted",
        "SpaceNotFound",
      ].includes(String(result.error))
        ? 403
        : response.status === 401 ||
            ["ExpiredToken", "InvalidToken"].includes(String(result.error))
          ? 401
          : response.status === 403
            ? 403
            : response.status === 429
              ? 429
              : 400;
      throw Object.assign(
        failure(
          status,
          status === 401 ? "Sign in again" : "PDS refused the request",
        ),
        { code: result.error },
      );
    }
    // The indexed schema checks the external response before it gains a type.
    const parsed = rpcSchemas[method].safeParse(result);
    if (!parsed.success) throw failure(502, "Invalid PDS response");
    return parsed.data as RpcResults[M];
  }
  async function credential(session: Session, space: string): Promise<Read> {
    parseSpace(space);
    const { token } = await rpc(
      "com.atproto.space.getDelegationToken",
      { space },
      session,
    );
    const key = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const endpoint = "/xrpc/com.atproto.space.getSpaceCredential";
    const result = await rpc(
      "com.atproto.space.getSpaceCredential",
      { space },
      null,
      true,
      {
        authorization: "Bearer " + token,
        dpop: proof(key, "POST", new URL(endpoint, publicOrigin)),
      },
    );
    return async <M extends RpcMethod>(
      method: M,
      data: Record<string, unknown> = {},
    ) =>
      rpc(method, data, null, false, {
        authorization: "DPoP " + result.credential,
        dpop: proof(
          key,
          "GET",
          new URL("/xrpc/" + method, publicOrigin),
          result.credential,
        ),
      });
  }
  return { rpc, credential };
}

export type Pds = ReturnType<typeof createPds>;
