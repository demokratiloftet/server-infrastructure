import { z } from "zod";
import { recordSchema, referenceSchema } from "./contracts.ts";
import type { PdsRecord } from "./contracts.ts";
export class PdsError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(`PDS: ${code}`);
    this.code = code;
    this.status = status;
  }
}
export interface WriteSession {
  did: string;
  accessJwt?: string;
  fetchHandler?: (path: string, init?: RequestInit) => Promise<Response>;
}
const sessionSchema = z.object({
  did: z.string(),
  accessJwt: z.string(),
  refreshJwt: z.string(),
  handle: z.string(),
});
const jsonObject = z.record(z.string(), z.unknown());
async function responseObject(response: Response) {
  const result = jsonObject.parse(await response.json());
  if (!response.ok)
    throw new PdsError(
      typeof result.error === "string" ? result.error : "Unavailable",
      response.status,
    );
  return result;
}
export function createPds(base: string) {
  const origin = new URL(base);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/"
  )
    throw new Error("PDS_URL must be an HTTP(S) origin");
  async function rpc(
    method: string,
    data: Record<string, unknown> = {},
    token?: string | null,
    write = false,
  ) {
    const url = new URL(`/xrpc/${method}`, origin);
    if (!write)
      for (const [key, value] of Object.entries(data)) {
        if (typeof value !== "string")
          throw new Error("XRPC query parameters must be strings");
        url.searchParams.set(key, value);
      }
    return responseObject(
      await fetch(url, {
        method: write ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          ...(write ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(write ? { body: JSON.stringify(data) } : {}),
      }),
    );
  }
  return {
    rpc,
    login: async (identifier: string, password: string) =>
      sessionSchema.parse(
        await rpc(
          "com.atproto.server.createSession",
          { identifier, password },
          null,
          true,
        ),
      ),
    resolve: async (handle: string) =>
      z
        .string()
        .parse(
          (await rpc("com.atproto.repo.describeRepo", { repo: handle })).did,
        ),
    get: async (repo: string, collection: string, rkey: string) =>
      recordSchema.parse(
        await rpc("com.atproto.repo.getRecord", { repo, collection, rkey }),
      ),
    async list(repo: string, collection: string) {
      const records: PdsRecord[] = [];
      let cursor: string | undefined;
      do {
        const page = z
          .object({
            records: z.array(recordSchema),
            cursor: z.string().optional(),
          })
          .parse(
            await rpc("com.atproto.repo.listRecords", {
              repo,
              collection,
              limit: "100",
              ...(cursor ? { cursor } : {}),
            }),
          );
        records.push(...page.records);
        cursor = page.cursor;
        if (records.length > 10000)
          throw new Error("Demo repository is too large");
      } while (cursor);
      return records;
    },
    async create(
      session: WriteSession,
      collection: string,
      record: Record<string, unknown>,
    ) {
      const payload = {
        repo: session.did,
        collection,
        record,
        validate: false,
      };
      if (session.fetchHandler)
        return referenceSchema.parse(
          await responseObject(
            await session.fetchHandler("/xrpc/com.atproto.repo.createRecord", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            }),
          ),
        );
      if (!session.accessJwt) throw new Error("Missing PDS authorization");
      return referenceSchema.parse(
        await rpc(
          "com.atproto.repo.createRecord",
          payload,
          session.accessJwt,
          true,
        ),
      );
    },
    remove: (
      session: z.infer<typeof sessionSchema>,
      collection: string,
      rkey: string,
    ) =>
      rpc(
        "com.atproto.repo.deleteRecord",
        { repo: session.did, collection, rkey },
        session.accessJwt,
        true,
      ),
  };
}
export type Pds = ReturnType<typeof createPds>;
