import { z } from "zod";
import type { KeyObject } from "node:crypto";
const text = z.string().min(1);
const session = z.object({ did: text, handle: text, accessJwt: text });
export const notice = z.object({
  $type: z.literal("no.demokratiloftet.demo.notice"),
  text: z.string().max(2000),
  createdAt: z.iso.datetime(),
  demo: z.literal(true),
});
const spaceRecord = z.object({ rkey: text, cid: text, value: notice });
const empty = z.object({}).passthrough();
export const rpcSchemas = {
  "com.atproto.server.createAccount": session,
  "com.atproto.server.createSession": session,
  "com.atproto.server.getSession": z.object({ did: text }),
  "com.atproto.space.getDelegationToken": z.object({ token: text }),
  "com.atproto.space.getSpaceCredential": z.object({ credential: text }),
  "com.atproto.repo.describeRepo": z.object({ did: text }),
  "com.atproto.repo.listRecords": z.object({ records: z.array(z.unknown()) }),
  "com.atproto.space.listRecords": z.object({
    records: z.array(spaceRecord),
    cursor: text.optional(),
  }),
  "com.atproto.simplespace.createSpace": z.object({ uri: text }),
  "com.atproto.simplespace.listMembers": z.object({
    members: z.array(
      z.object({ did: text, read: z.boolean(), write: z.boolean() }),
    ),
    cursor: text.optional(),
  }),
  "com.atproto.space.createRecord": z.object({ uri: text, cid: text }),
  "com.atproto.simplespace.putMember": empty,
  "com.atproto.simplespace.removeMember": empty,
} as const;
export type RpcMethod = keyof typeof rpcSchemas;
export type RpcResults = { [M in RpcMethod]: z.infer<(typeof rpcSchemas)[M]> };
export type Session = z.infer<typeof session>;
export type Read = <M extends RpcMethod>(
  method: M,
  data?: Record<string, unknown>,
) => Promise<RpcResults[M]>;
export type DpopKey = { publicKey: KeyObject; privateKey: KeyObject };
export interface Account {
  did: string;
  username: string;
}
export interface GroupView {
  name: string;
  owner: boolean;
  records: z.infer<typeof spaceRecord>[];
  more: boolean;
  members?: RpcResults["com.atproto.simplespace.listMembers"]["members"];
}
