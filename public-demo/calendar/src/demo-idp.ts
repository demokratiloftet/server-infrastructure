import { z } from "zod";
import { demoPeople, html } from "./demo-people.ts";
// Disposable synthetic identity provider. Never deploy this as a real IdP.
import http from "node:http";
import { randomBytes } from "node:crypto";
import { Provider } from "oidc-provider";
import { generateKeyPair, exportJWK } from "jose";
const issuer = new URL(process.env.DEMO_IDP_ISSUER || "http://127.0.0.1:3002")
  .origin;
const appOrigin = new URL(
  process.env.DEMO_CLIENT_ORIGIN || "http://127.0.0.1:3000",
).origin;
const clientId = process.env.DEMO_CLIENT_ID || "loftet-local";
const clientSecret =
  process.env.DEMO_OIDC_SECRET ||
  (issuer.startsWith("http:") ? "synthetic-local-client-secret" : "");
if (!clientSecret)
  throw new Error("Shared demo IdP requires its own client secret");
const { privateKey } = await generateKeyPair("RS256", { extractable: true });
const signingKey = {
  ...(await exportJWK(privateKey)),
  kid: randomBytes(12).toString("hex"),
  use: "sig",
  alg: "RS256",
};
const people = process.env.DEMO_PEOPLE_FILE
  ? demoPeople(process.env.DEMO_PEOPLE_FILE)
  : null;
const accounts = {
  alice: "Ada Eksempel",
  bob: "Bo Eksempel",
  charlie: "Charlie Testkonto",
  dina: "Dina Testkonto",
};
const provider = new Provider(issuer, {
  jwks: { keys: [signingKey] },
  clients: [
    {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [`${appOrigin}/auth/oidc/demo/callback`],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "client_secret_post",
    },
  ],
  features: { devInteractions: { enabled: false } },
  cookies: { keys: [randomBytes(32).toString("hex")] },
  pkce: { required: () => true },
  claims: { openid: ["sub"], profile: ["name"] },
  findAccount: async (_ctx, id) => {
    const name = { ...accounts, ...people?.all() }[id];
    return typeof name === "string"
      ? {
          accountId: id,
          async claims() {
            return { sub: id, name };
          },
        }
      : undefined;
  },
  interactions: {
    url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
  },
});
provider.proxy = issuer.startsWith("https:");
const callback = provider.callback();
http
  .createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(issuer).host) {
        res.writeHead(403);
        return res.end("Unknown host");
      }
      const url = new URL(req.url ?? "/", issuer);
      if (url.pathname === "/health") {
        res.writeHead(200);
        return res.end("ok");
      }
      const match = /^\/interaction\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
      if (!match) return callback(req, res);
      const interaction = await provider.interactionDetails(req, res);
      res.setHeader("cache-control", "no-store");
      if (req.method === "GET") {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.setHeader(
          "content-security-policy",
          `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${appOrigin}; frame-ancestors 'none'; base-uri 'none'`,
        );
        const login = interaction.prompt.name === "login";
        return res.end(
          `<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Demo-identitet — Loftet</title><style>body{font:16px system-ui;background:#f8f8f1;color:#243d35;max-width:440px;margin:10vh auto;padding:24px}h1{font-weight:500;font-size:36px}button,select,input{font:inherit;width:100%;padding:14px;margin:10px 0;border:1px solid #bbcbb5;border-radius:6px}button{background:#174e43;color:white}p{line-height:1.6}.note{background:#e9eedb;padding:16px}</style><p>LOFTET / TESTLEVERANDØR</p><h1>${login ? "Velg en demo-identitet." : "Fortsett til kalenderen?"}</h1><p class="note">Dette er fiktive testpersoner, ikke Idrettens ID, BankID, Vipps eller Feide.</p><form method="post" action="/interaction/${interaction.uid}">${
            login
              ? `${people ? '<h2>Ny her?</h2><label>Navn på ny testperson<input name="name" maxlength="60" placeholder="For eksempel: Kari Demo" autocomplete="off"></label><button name="action" value="new">Opprett og bruk ny testperson</button><p>Et nytt navn får en ny identitet. Ingen gamle koblinger følger med.</p><hr>' : ""}<h2>Fortsett som en eksisterende testperson</h2><label>Testperson<select name="account">${Object.entries(
                  { ...accounts, ...people?.all() },
                )
                  .map(
                    ([id, name]) =>
                      `<option value="${html(id)}">${html(name)}</option>`,
                  )
                  .join(
                    "",
                  )}</select></label><button name="action" value="continue">Fortsett med testpersonen</button>`
              : '<p>La Loftet bruke denne testidentiteten til innlogging. Du bekrefter eventuell kontokobling i neste steg. Ingen klubbroller blir bekreftet.</p><button name="action" value="continue">Fortsett til Loftet</button>'
          }<button name="action" value="cancel">Avbryt</button></form></html>`,
        );
      }
      if (req.method !== "POST" || req.headers.origin !== issuer) {
        res.writeHead(403);
        return res.end("Invalid origin");
      }
      let text = "";
      for await (const c of req) {
        text += c;
        if (text.length > 4096) throw new Error("Too large");
      }
      const body = new URLSearchParams(text);
      if (body.get("action") === "cancel")
        return provider.interactionFinished(
          req,
          res,
          { error: "access_denied" },
          { mergeWithLastSubmission: false },
        );
      if (interaction.prompt.name === "login") {
        const id =
          body.get("action") === "new" && people
            ? people.create(body.get("name"))
            : body.get("account");
        if (!id || typeof { ...accounts, ...people?.all() }[id] !== "string")
          throw new Error("Unknown synthetic account");
        return provider.interactionFinished(
          req,
          res,
          { login: { accountId: id } },
          { mergeWithLastSubmission: false },
        );
      }
      if (interaction.prompt.name === "consent") {
        if (!interaction.session) throw new Error("Missing consent session");
        const grant = interaction.grantId
          ? await provider.Grant.find(interaction.grantId)
          : new provider.Grant({
              accountId: interaction.session.accountId,
              clientId: z.string().parse(interaction.params.client_id),
            });
        if (!grant) throw new Error("Grant expired");
        const scopes = z
          .array(z.string())
          .optional()
          .parse(interaction.prompt.details.missingOIDCScope);
        const claims = z
          .array(z.string())
          .optional()
          .parse(interaction.prompt.details.missingOIDCClaims);
        if (scopes) grant.addOIDCScope(scopes.join(" "));
        if (claims) grant.addOIDCClaims(claims);
        return provider.interactionFinished(
          req,
          res,
          { consent: { grantId: await grant.save() } },
          { mergeWithLastSubmission: true },
        );
      }
      throw new Error("Unsupported interaction");
    } catch (error) {
      console.error(
        "Demo interaction failure:",
        error instanceof Error ? error.name : "UnknownError",
      );
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("Demo-økten er utløpt. Start kontokoblingen på nytt fra Loftet.");
    }
  })
  .listen(3002, "0.0.0.0", () =>
    console.log(
      "Synthetic OIDC provider listening on its private container port",
    ),
  );
