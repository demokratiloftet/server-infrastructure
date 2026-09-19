# @loftet/auth

Reusable Node.js auth package, currently used by the calendar. It combines AT
Protocol OAuth login with private OIDC identity linking. It does not publish
claims, infer club membership, or treat provider identities as interchangeable.

## Boundaries

- `atproto.mjs`: official `@atproto/oauth-client-node` SDK, including PKCE, PAR,
  DPoP, issuer/identity validation and refresh. Handles resolve against the
  configured PDS and DIDs against the configured PLC. This sandbox accepts its
  own accounts, not arbitrary public accounts.
- `oidc.mjs`: `openid-client` authorization code + S256 PKCE, state, nonce,
  signature/JWKS, issuer, audience, expiry and authentication freshness checks.
- `service.mjs`: browser binding, session rotation, link confirmation, unlink,
  logout and the public account-view model. Framework-independent methods accept
  Node-compatible request/response objects; see calendar routes in `src/server.mjs`.
- `store.mjs`: persistent encrypted SQLite adapter for a **single app process**.
  SDK refresh locks are process-local; use a shared database and distributed
  locks before running multiple app replicas.
- `transport.mjs`: exact outbound-origin allowlist. Development-only HTTP
  rewrites preserve canonical Host, issuer and DPoP URLs. Redirects are rejected.

## Reuse

This directory is an npm workspace package, installed as `@loftet/auth`. Copy it
into another workspace (or install from a local directory) and import:

```js
import {
  AuthStore, AuthService, OidcProvider,
  createAtprotoProvider, restrictedFetch,
} from '@loftet/auth'
```

Use `src/auth.mjs` as the composition example. Supply your own app origin,
configured PDS/PLC, storage directory, encryption key, fetch allowlist, and
provider definitions. Keep both signing-in and linking routes on the same app
origin. Mutating routes must enforce same-origin JSON requests, as the calendar
adapter does. Never expose auth store contents or callback query strings in logs.

## Login and linking lifecycle

1. Same-origin `POST /auth/atproto/start` sets an opaque HttpOnly, SameSite=Lax
   browser cookie and creates a ten-minute flow bound to that browser.
2. The user enters their password **at their PDS** and approves access.
3. `/auth/atproto/callback` checks the browser binding before exchanging the code.
   The SDK validates the protocol response; the app rotates the browser session.
4. An authenticated user starts OIDC linking for a configured provider. Their AT
   login must be less than 15 minutes old. The flow binds browser + DID + provider.
5. The provider authenticates the user (`prompt=login`, `max_age=300`). The callback
   validates the signed identity token, then creates a ten-minute pending link.
6. The user explicitly confirms which identity to connect to the displayed DID.
   Only then is the private `(issuer, subject) → DID` association saved.
7. Unlink needs recent AT authentication. It removes the local association; it
   does not delete the provider account. OIDC tokens are discarded after checking
   identity, so unlink does not have stored provider tokens to revoke.

No matching by email, name or telephone number. No automatic merging. One identity
per provider per DID, and one DID per `(issuer, subject)`, including when the same
issuer is configured under another provider ID. A person can use the same subject
string at *different issuers* without collision.

Multiple browser sessions for the same DID share the SDK authorization.
Reauthentication rotates that browser cookie. Logout invalidates all local
sessions for that DID immediately and attempts PDS token revocation, including if that attempt
fails during an outage. Logging out does not erase private account links.

## Persistent storage

`auth-data` is a named Docker volume. Values (tokens, DPoP private keys, SDK state,
PKCE secrets, pending identities and saved identities) are AES-256-GCM encrypted,
with namespace/key bound as authenticated data. Browser cookies are random and
only their SHA-256 hashes index stored sessions. Link uniqueness uses a keyed
hash of issuer + subject. Audit rows contain action, DID, provider ID and time;
no tokens, external subject identifiers or personal profile claims.

Local development generates a 0600 encryption key inside the volume. This
protects a database copied by itself, **not theft of the entire volume/key**.
Shared environments must set a stable `AUTH_ENCRYPTION_KEY` (64 hex characters),
back it up separately, and restrict host access. Changing/losing the key makes
existing encrypted data unreadable. Do not commit keys or `.env.vps`.

The app's sessions and links survive app/container restarts. The underlying local
PDS remains disposable: restarting it creates different DIDs, so old links do not
transfer to new accounts. The synthetic IdP also intentionally uses disposable
sessions; restarting it requires starting an unfinished link flow again.

## Add a provider later

A provider definition is server configuration, never user-supplied discovery:

```json
{
  "id": "partner-test",
  "label": "Partner test identity",
  "issuer": "https://identity.partner.example",
  "clientId": "registered-client-id",
  "clientSecret": "from-your-secret-store",
  "clientAuth": "client_secret_post",
  "scopes": "openid",
  "idTokenAlgorithm": "RS256"
}
```

Set the exact callback at the provider to
`https://your-app.example/auth/oidc/partner-test/callback`. Add the provider's
reviewed discovery/token/JWKS origins to the fetch allowlist and the deployment's
network policy. Request only the claims you need. The base adapter supports
`client_secret_post`, `client_secret_basic` and `none`; provider requirements such
as PAR, private-key client authentication, mTLS, custom headers or non-OIDC
protocols require an adapter extension. Optional `acrValues` requests an assurance
level; `requiredAcr` enforces an exact expected result. Do not assume an identity
link has a particular assurance level without agreeing and testing that contract.

Provider readiness:

| Provider | Current state | Required before activation |
|---|---|---|
| Local Demo-identitet | Working OIDC fixture, two synthetic identities | None |
| Idrettens ID | Configuration template prepared; not activated | NIF approval, registered test client and restricted egress |
| BankID | Not connected | Approved provider/integrator, test agreement and authentication profile |
| Vipps | Preset implemented; synthetic tests pass; not activated | Login-enabled sales unit credentials, registered callback and constrained external egress |
| Feide | Not connected | Registered OIDC application and selected attribute groups |

Provider references: [Idrettens ID](https://www.idrettsforbundet.no/digital/idrettens-id/),
[Vipps Login](https://developer.vippsmobilepay.com/docs/APIs/login-api/login-api-quick-start/),
[Feide OIDC setup](https://docs.feide.no/service_providers/getting_started/add_feide_login.html).
Real identity providers remain unreachable from the local sandbox. Introduce them
in an explicitly configured integration environment, not by weakening local
firewalls. Account links remain private; a later issuer can use them as input to
separately authorized, narrowly scoped attestations.

## Limitations

This is a tested development component, not a completed high-assurance identity
product. It has no account recovery/merge flow, provider-initiated logout,
provider token renewal (tokens are discarded), multi-replica coordination,
full audit retention policy, or automatic provider-specific onboarding.

The current local PDS advertises legacy scopes, so the AT client requests
`atproto transition:generic` to create event records. That grants broad repository
access. Move to collection-scoped permissions when both the deployed PDS and
client support them. HTTPS shared deployments currently use public OAuth client
metadata (`token_endpoint_auth_method=none`); confidential client key management
is a separate deployment enhancement. Actual VPS/provider compatibility remains
to be tested with their registered clients and canonical URLs.

See [Vipps setup and remaining activation requirements](VIPPS.md).

See [Min idrett / Idrettens ID preparation and request to NIF](MIN-IDRETT.md).

OIDC-first onboarding is implemented by [IdentityGateway](../identity/README.md).
Identity links alone are not login grants; the gateway requires explicit consent.
