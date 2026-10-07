import { z } from "zod";
import type { AuthRequest } from "@loftet/auth";
const inputSchema = z.object({
  action: z.enum(["grant", "revoke"]),
  clubId: z.string(),
});
interface PermissionOptions {
  environment: string;
  auth: { requireUser(req: AuthRequest): { did: string } };
  service: {
    grant(club: string, did: string): Promise<unknown>;
    revoke?(club: string, did: string): Promise<unknown>;
  };
  req: AuthRequest;
  input: unknown;
}
// Request data can never select the subject receiving a demo grant.
export async function demoPermission({
  environment,
  auth,
  service,
  req,
  input,
}: PermissionOptions) {
  if (
    environment !== "local" &&
    !(environment === "public-demo" && process.env.DEMO_SELF_SERVICE === "true")
  )
    throw Object.assign(new Error("Demo shortcut disabled"), { status: 404 });
  const user = auth.requireUser(req);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw Object.assign(new Error("Ugyldig demohandling"), { status: 400 });
  const method = service[parsed.data.action];
  if (!method) throw new Error("Demo action unavailable");
  return method(parsed.data.clubId, user.did);
}
