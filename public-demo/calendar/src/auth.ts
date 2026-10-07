import { z } from "zod";
const providerSchema = z.object({
  id: z.string(),
  label: z.string(),
  issuer: z.string(),
  clientId: z.string(),
  clientSecret: z.string().optional(),
  clientAuth: z.string().optional(),
  scopes: z.string(),
  demo: z.boolean().optional(),
  idTokenAlgorithm: z.string().optional(),
  market: z.string().optional(),
  acrValues: z.string().optional(),
  requiredAcr: z.string().optional(),
});
import { IdentityGateway, HandleProvisioner } from "@loftet/identity";
import { sandboxPdsProvisioner } from "@loftet/identity/sandbox";
import {
  AuthStore,
  OidcProvider,
  createAtprotoProvider,
  restrictedFetch,
  vippsDefinition,
} from "@loftet/auth";
export function createAuth(origin: string, environment: string) {
  const local = environment === "local";
  if (!local && !process.env.AUTH_ENCRYPTION_KEY)
    throw new Error("Shared auth requires AUTH_ENCRYPTION_KEY");
  const store = new AuthStore(
    process.env.AUTH_DATA_DIR || "/data/auth",
    process.env.AUTH_ENCRYPTION_KEY,
  );
  const pdsOrigin =
    process.env.ATPROTO_PDS_ORIGIN ||
    (local ? "http://localhost:2583" : undefined);
  const plcUrl =
    process.env.ATPROTO_PLC_URL ||
    (local ? "http://localhost:2582" : undefined);
  if (!pdsOrigin || !plcUrl)
    throw new Error("Configure ATPROTO_PDS_ORIGIN and ATPROTO_PLC_URL");
  const definitions = local
    ? [
        {
          id: "demo",
          label: "Demo-identitet",
          demo: true,
          issuer: "http://127.0.0.1:3002",
          clientId: "loftet-local",
          clientSecret: "synthetic-local-client-secret",
          clientAuth: "client_secret_post",
          scopes: "openid profile",
        },
      ]
    : z
        .array(providerSchema)
        .parse(JSON.parse(process.env.OIDC_PROVIDERS_JSON || "[]"));
  if (process.env.VIPPS_CLIENT_ID || process.env.VIPPS_CLIENT_SECRET) {
    if (local)
      throw new Error(
        "Real Vipps credentials are not allowed in the isolated local sandbox",
      );
    if (definitions.some((p) => p.id === "vipps"))
      throw new Error("Configure Vipps once");
    definitions.push(
      vippsDefinition({
        environment: process.env.VIPPS_ENVIRONMENT || "test",
        clientId: process.env.VIPPS_CLIENT_ID,
        clientSecret: process.env.VIPPS_CLIENT_SECRET,
      }),
    );
  }
  const routes = local
    ? {
        "http://localhost:2583": "http://172.30.83.2:2583",
        "http://localhost:2582": "http://172.30.83.2:2582",
        "http://127.0.0.1:3002": "http://172.30.83.11:3002",
      }
    : z
        .record(z.string(), z.string())
        .parse(JSON.parse(process.env.AUTH_FETCH_ROUTES_JSON || "{}"));
  const fetch = restrictedFetch(routes);
  const atproto = createAtprotoProvider({
    origin,
    store,
    fetch,
    pdsOrigin,
    plcUrl,
    allowHttp: local,
  });
  const providers = definitions.map(
    (definition) =>
      new OidcProvider(definition, { origin, fetch, allowHttp: local }),
  );
  return new IdentityGateway({
    store,
    atproto,
    providers,
    origin,
    entryProviders: local
      ? ["demo"]
      : z
          .array(z.string())
          .parse(JSON.parse(process.env.IDENTITY_LOGIN_PROVIDERS_JSON || "[]")),
    provisioner: local
      ? new HandleProvisioner({
          allowTest: true,
          namespaces: [
            {
              domain: "test",
              providers: ["demo"],
              adapter: sandboxPdsProvisioner({
                fetch: (url, init) =>
                  fetch(
                    String(url).replace("http://127.0.0.1:2583", pdsOrigin),
                    init,
                  ),
              }),
            },
          ],
        })
      : undefined,
  });
}

export type CalendarAuth = ReturnType<typeof createAuth>;
export type AuthState = ReturnType<CalendarAuth["state"]> & {
  publicDemo?: boolean;
};
