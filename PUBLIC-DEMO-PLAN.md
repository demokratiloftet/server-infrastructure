# Public demo, private federation

Investigation date: 2026-09-19. Implementation: branch `feat/public-demo-private-federation`.
See [deployment and verification guide](public-demo/README.md) for the implemented
opt-in overlay. The audit and proposed design below are historical findings from
before implementation. Production public access has not been enabled.

## Required outcome

Anyone can open the demo URL, create an account on this PDS, log in, and use both
the calendar and social app. No invitations or Tailscale client are required for
participants. The PDS, private PLC directory, relay, Jetstream, and AppView remain
an isolated deployment: no public repository exports, firehose, or federation to
external services. Tailscale remains available for administration.

Public signup does not prevent participants from copying content they can read.
The boundary is enforced system distribution, not an assurance against copying.
Content necessarily reaches signed-in participants' browsers over HTTPS.

The user explicitly confirmed **calendar and social app** during the audit.
Both must use this PDS. The design therefore needs both the calendar's
server-side OAuth flow and the social client's browser-side APIs. Start with
text/image posts, profiles, feeds and basic interactions; external chat, video,
GIF and link-preview integrations must be disabled until locally implemented.
This feature limit is a proposed implementation boundary, not a completed change.

## Evidence from the running VPS and installed code

No service was restarted, no firewall/DNS setting changed, and no account or post
was created during this investigation. Source and selected configuration were
read without printing credentials. Probes returned status and counts only.

| Finding                                                           | Evidence and implication                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signup is enabled at the PDS                                      | `PDS_INVITE_REQUIRED=false`; the previous live `describeServer` probe also reported `inviteCodeRequired: false`.                                                                                                                                                                                                   |
| Built-in OAuth signup exists                                      | Installed `@atproto/pds` 0.5.34 uses `@atproto/oauth-provider` 0.22.8. Its browser API includes `/@atproto/oauth-provider/~api/sign-up` and handle-availability checking, as well as sign-in and consent. This is source evidence, not a completed public browser signup test.                                     |
| Login can start without an existing handle                        | The calendar's installed OAuth SDK accepts a PDS URL as the authorization input (`oauth-resolver.js`). A server-selected PDS origin can start signup/login without requiring a pre-existing account.                                                                                                               |
| PDS ports are private                                             | PDS Docker host port bindings are empty. Existing Traefik shares the Tailscale container's network namespace and has no host port bindings.                                                                                                                                                                        |
| Internal federation is configured                                 | PDS/relay/AppView use the private PLC. AppView and Jetstream use this deployment's relay. No public crawler destinations are configured; installed PDS defaults to `[]`. This does not itself restrict network access.                                                                                             |
| PDS egress is unrestricted at its namespace                       | IPv4 OUTPUT policy is ACCEPT. The previous host audit also found no restrictive DOCKER-USER rules. Calendar has a separate deny-by-default egress policy.                                                                                                                                                          |
| SSRF protection cannot simply be enabled                          | A separate process using the installed PDS `safeFetchWrap` fetched calendar OAuth metadata with protection disabled (HTTP 200), but with protection enabled failed with `Hostname resolved to non-unicast address`. The running service configuration was not changed.                                             |
| No private-origin exception is exposed by PDS fetch configuration | Installed config passes a boolean `ssrfProtection` to the wrapper. Do not assume a supported per-host exemption environment variable exists.                                                                                                                                                                       |
| Development protections need explicit configuration               | Live `PDS_DEV_MODE=true` and `PDS_DISABLE_SSRF_PROTECTION=true`. `PDS_RATE_LIMITS_ENABLED` is unset and this installed version defaults the XRPC rate limiter to disabled. OAuth browser API rate controls require separate review.                                                                                |
| Calendar data currently needs no login                            | A cookie-free HTTP request inside the app container, with the correct Host header, returned HTTP 200 and five events from `/api/state`. Publicly forwarding this endpoint as-is would expose event content.                                                                                                        |
| Calendar signup UI is not ready for shared use                    | Shared `createAuth` does not configure the local identity-account provisioner. Current UI asks for an existing handle. Prefer the PDS's built-in signup rather than reusing synthetic OIDC onboarding or its shared local test password.                                                                           |
| New users do not automatically have publishing authority          | `service.publish` checks issuer grants. The self-service permission shortcut currently only runs with `APP_ENV=local`; shared VPS users cannot use it. Keep the real issuer check and add an explicit, limited public-demo mechanism.                                                                              |
| Administrative demo routes are not public-user features           | `/api/session` unlocks grant/revoke/seed operations with a demo key. They must stay private; do not distribute that key to new users.                                                                                                                                                                              |
| Social client defaults are not fully isolated                     | Deployed source maps and corresponding compiled JavaScript set `BSKY_SERVICE = 'https://bsky.social'` and `DEFAULT_SERVICE = BSKY_SERVICE`. Signup state and login initialize with that default. Rendered `window.BSKY_CONFIG` overrides AppView, feed owner, and labeler, but does not override that PDS default. |
| Social client has external feature destinations                   | The deployed bundle contains public cardyb link previews, GIF, video, geolocation/config endpoints, and a public chat proxy DID. These are potential browser/service request paths, not evidence that a particular user's content was sent. VPS egress filtering does not govern participants' browsers.           |
| Social login differs from calendar login                          | Deployed `src/state/session/agent.ts` uses `BskyAgent.login` and `createAccount`; calendar uses server-side OAuth. Public routing must support the social client's necessary session and record operations, not only OAuth pages.                                                                                  |
| Social source provenance is available                             | Image labels identify `https://github.com/eurosky-social/social-app`, revision `97788ff94232ae9da0b5cd2a5411474f9f2805fd`, image version `bskyweb-2025-10-27T15-31-04-00-00`. Build a reviewed derivative from that source, not ad hoc edits to minified JavaScript.                                               |

PDS image inspected:
`ghcr.io/bluesky-social/pds@sha256:05e164855fa1a3cf251c002210c46f8c86e7ae27bddc7a96045da25483840826`.

Social image inspected:
`ghcr.io/eurosky-social/social-app@sha256:6d3b8819e1b43918fb963aa42e40398cb3e9db99a0ac4f5421cfc709c241d337`.

There is a pre-existing uncommitted change in `calendar-app/src/server.mjs`.
It was inspected, not altered. Do not overwrite it when implementing the changes.

## Recommended implementation

### 1. Separate public ingress from the existing private proxy

Use an independently configured HTTPS gateway on the same VPS, with explicit
hostname, path, and method rules and a deny-by-default fallback. Do not publish
the existing Traefik listener: it already routes the PDS, PLC, relay, Jetstream,
AppView, social app, and administration dashboard.

Keep the existing canonical PDS hostname and issuer. Public DNS can route its
browser-facing hostname to the new gateway while private service resolution
continues to reach the internal proxy. Preserve Host, HTTPS origin, cookies, and
OAuth issuer/DPoP URLs. Do not rewrite the issuer casually or migrate account DIDs.
Review both IPv4 and IPv6, wildcard hostnames, direct IP access, and all aliases.

Initial route inventory (not yet a deployable allowlist):

| Route or service                                                              | Public treatment                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Calendar landing page and required static assets                              | Available before login.                                                                                                                                                              |
| Calendar auth start, callback, auth status, logout                            | Allow specific methods; keep session, CSRF/origin checks and bounded requests.                                                                                                       |
| Calendar `/api/state`, activity creation, future media reads                  | Require a valid app session. Return a minimal logged-out landing state without records or private identity links.                                                                    |
| Calendar OAuth client metadata                                                | Exact read-only URL accessible to the PDS; contains metadata, not posts or secrets.                                                                                                  |
| PDS `/oauth/authorize` and `/oauth/authorize/redirect`                        | Browser OAuth flow, with exact route handling.                                                                                                                                       |
| PDS OAuth browser API and UI assets                                           | Allow only the signup, login, consent and assets actually required. Inventory from this pinned version and verify through browser tests. No blanket `/*` or `/xrpc/*`.               |
| PDS discovery, PAR, token and OAuth revocation                                | Calendar backend uses private routes. Expose only non-content metadata if proven necessary for browser flows.                                                                        |
| Social signup/login/refresh and necessary authenticated record operations     | Explicit XRPC method allowlist to this PDS. Validate sessions and limit operations; never expose all XRPC methods. Protect any required normally-public record reads at the gateway. |
| Social feeds, profiles, notifications and media                               | Authenticated application access through a controlled gateway. Individual reads are needed by the social app; they must not become anonymous AppView or media mirrors.               |
| PDS bulk repository exports, synchronization, import/migration and admin APIs | No public route, including for a user holding a valid PDS token.                                                                                                                     |
| Raw blob retrieval                                                            | No anonymous public route. If required by the social UI, expose only via its authenticated media path.                                                                               |
| PLC, relay, Jetstream, databases, dashboard                                   | No general public route. Identity resolution needed by browsers must be handled by a fixed, narrow application route, not by opening the PLC wholesale.                              |
| Calendar demo administration and synthetic IdP                                | Remain private. No shared admin key or synthetic identity-provider access in the public signup journey.                                                                              |

Include path normalization, encoding, WebSocket upgrades, HTTP methods, Host
headers, forwarded headers, and route precedence in negative tests. Pin the
gateway version and avoid Docker socket access for the public gateway.

### 2. Reuse real PDS signup and OAuth

Add a simple Create account / Log in action that starts OAuth against the
operator-configured PDS origin. Never let the browser select an arbitrary PDS or
OAuth client. Use the PDS's signup UI so passwords remain at the PDS. Preserve
browser-bound state, PKCE, DPoP, callback checks, and encrypted token storage.

Verify the pinned PDS UI actually exposes signup in this authorization journey,
including return to the app and consent. Test the account's DID, PDS host, and
local PLC entry, then publish using that account's OAuth authorization. Do not
replace per-user writes with writes from the organiser account.

Require login for content reads. Adapt the calendar UI to a logged-out landing
state rather than loading `/api/state` anonymously. Keep signup open to everyone.

Add a separate explicit public-demo permission setting, with tests that a user
can request only their own synthetic grant for predefined demo clubs. Preserve
issuer verification, revocation behavior and clear demo labels. Do not set
`APP_ENV=local` on the VPS or expose the administrator's grant/revoke/seed routes.

### 3. Adapt the social client and authenticated data gateway

Rebuild the pinned social client with a fixed local-PDS default and prevent
selection/restoration of external PDS accounts. Review persisted account sessions
and service URLs, not just the initial dropdown. Configure private AppView, labeler
and feed generator behavior, remove external suggested feeds and public-network
fallbacks, and handle errors without falling back to public services.

Inventory actual browser XRPC calls for signup, login, refresh, profile setup,
post/reply/like/follow, images, feeds, preferences and notifications. The browser
client needs direct allowed operations that the calendar's backend-only design
does not. Preserve method-level PDS authorization, and verify tokens at the
gateway for normally-public reads; merely checking that an Authorization header
exists is insufficient. Constrain `atproto-proxy`, labeler choices and other
service-selection headers to local services. Keep sync/export endpoints denied
even when a valid token is presented.

Images loaded by `<img>` do not automatically carry API bearer headers. Provide a
same-origin authenticated media path backed by a secure browser session (or an
equivalent tested design); do not open an unauthenticated CDN to make images work.
Check server-rendered profile/post pages, metadata embeds and thumbnails too.
Accounts can be shared across apps without assuming that their browser sessions
or authentication implementations are identical.

Disable or replace external chat, video uploads/playback, GIF search, link
previews, geolocation/feature configuration and telemetry. Enforce a restrictive
browser Content Security Policy covering connect, image, media, script, frame
and form destinations. Review external links/referrers and embedded URLs. A
network request from a user's browser is outside the VPS firewall boundary.

### 4. Enable SSRF protection without breaking private dependencies

First address the demonstrated OAuth metadata failure. A candidate that avoids a
PDS fork is to serve the calendar's exact client-metadata URL at a hostname that
resolves, from the PDS, to this VPS's public unicast IP and the new gateway.
Permit PDS access to that address/port and have the gateway serve only the required
metadata route for that use. The metadata contains no account content. Check the
actual local/hairpin route, TLS validation, and HTTP policy in staging.

This is a proposed solution, not a verified fix. Test the remaining signup,
private PLC, consent, scope-resolution, refresh, posting and proxy paths with
both `PDS_DEV_MODE=false` and `PDS_DISABLE_SSRF_PROTECTION=false`.
Other safe-fetch callers may also reject private dependencies. If so, resolve
them explicitly; do not quietly restore global SSRF disablement or unrestricted
internet egress. No public PLC registration or account migration is required.

Treat DNS and gateway access as part of the restriction: an allowed IP can host
multiple services. Apply HTTP-level policy as well as destination/port rules;
block arbitrary service-proxy headers, redirects and user-selected URLs.

### 5. Restrict the whole content-handling stack

Build an explicit dependency matrix for the calendar, PDS, PLC, relay, Jetstream,
AppView, feed generator, and moderation services. Keep default-deny egress for
both address families, including DNS, with only the connections needed inside
this infrastructure. Use fixed reviewed destinations/service identities and
reproducible rules that survive restarts; handle Docker IP changes deliberately.

Do not rely on an internal Docker network alone, on an empty crawler list, or on
one DOCKER-USER rule without checking rule order. Test indirect paths via allowed
proxies/services too. The existing AppView config includes public video URL
templates; do not enable external video, link-preview, reporting, or other
integrations implicitly. Certificate/DNS automation and Tailscale need their own
limited external access, separated from processes handling user content.

Explicitly keep PDS crawlers empty. Preserve local synchronization only. Enable
rate limits with correct trusted-proxy/client-IP handling, bounded storage and
signup limits. Review OAuth-specific limits independently of XRPC configuration.
Rate limiting must not collapse every visitor onto the gateway's single IP or
trust spoofed forwarding headers from clients.

Keep post content out of third-party logs, telemetry and backups. Email delivery
and account recovery need an explicit choice for the demo; do not silently rely
on a development mail transport or introduce external identity providers.

## Deployment order and acceptance checks

1. Prepare code and gateway/network configuration locally as an opt-in public
   deployment. Preserve the loopback-only local sandbox and existing private VPS
   deployment as rollback paths.
2. Use a disposable staging stack with the same pinned PDS image and private PLC.
   Do not reuse live volumes or reset existing accounts. Test non-development
   configuration and SSRF behavior before changing the live services.
3. Run calendar unit, integration and isolation checks (`npm test`,
   `npm run test:integration`, `npm run verify`) after implementation. Add tests
   for session-gated reads, local-PDS signup, permission self-service and gateway
   bypass attempts. Local sandbox tests alone do not certify public isolation.
4. Verify backups and restoration, keep the auth volume and encryption key paired,
   and prepare rollback for app/proxy/firewall/DNS changes. No key rotation,
   issuer/DID migration, database reset, or `down -v` is part of this work.
5. Install the gateway closed to public content while validating private service
   health. Apply persistent restrictions without losing administrative access.
6. From a genuinely non-tailnet connection, create a disposable account, log in,
   publish and view a calendar activity and social post. Verify they are in this
   PDS and visible through authenticated application routes. Test accounts created
   from each app in the other app, logout, refresh, two accounts, media, social
   interactions, failure handling, and persistence after restart. Capture browser
   request destinations during signup, composing and reading; no public PDS,
   public AppView, telemetry, preview, GIF, chat or video service may receive them.
7. Test repository exports, raw records, blobs, WebSocket streams, alternate
   hostnames, raw IPs, both IP families, and internal service routes without a
   session and with valid ordinary-user credentials. They must remain unavailable
   through denied interfaces. Ordinary users may use the deliberately allowed
   social APIs; that is application access, not a public replication interface.
   Test known real record IDs, not just malformed requests that might fail for
   unrelated reasons.
8. Verify external/metadata/private-but-unapproved destinations are blocked from
   every relevant service, including via DNS, redirects, and proxy features. Do
   not submit real records to public services as a test. Recheck after restart.

## Validation completed in this investigation

- Read-only runtime/configuration and installed-source inspection on the VPS.
- Paired protected/unprotected OAuth metadata fetch probe reproduced the SSRF
  compatibility issue without changing the running PDS configuration.
- Cookie-free calendar read confirmed existing anonymous content access on the
  private network (status/count only; records not printed).
- Existing calendar unit suite: **32 tests passed**.
- Inspected deployed social JavaScript, embedded source maps, rendered runtime
  configuration and image provenance. Confirmed external defaults in compiled
  code, not only in upstream documentation.
- Attempted a fresh agent-browser session at the social tailnet URL; navigation
  timed out from the local environment. No live browser request trace or signed-in
  social test was completed. The dedicated browser session was closed.
- No end-to-end public signup test, staging deployment, new egress policy, or
  outside-tailnet isolation certification has been completed.

The earlier 2–4 working-day estimate did not account for the now-confirmed social
client changes. A provisional budget for both apps is **4–7 working days**, subject
to a successful client rebuild and authenticated feed/media design. The main
uncertainties are SSRF/private-dependency compatibility and the social browser
request inventory. This report is an implementation plan, not deployment
configuration or a claim that the live installation is ready for public access.

Protocol references: [AT Protocol sync](https://atproto.com/specs/sync) documents
unauthenticated repository exports and relay subscriptions;
[AT Protocol OAuth](https://atproto.com/specs/oauth) documents metadata discovery,
authorization and token exchange.

Pinned social source: [client service constants](https://github.com/eurosky-social/social-app/blob/97788ff94232ae9da0b5cd2a5411474f9f2805fd/src/lib/constants.ts)
and [source repository README](https://github.com/eurosky-social/social-app/blob/97788ff94232ae9da0b5cd2a5411474f9f2805fd/README.md).
