# Vipps Login integration preparation

Status: provider preset and calendar configuration implemented; tested with a
signed synthetic OIDC fixture, NOT an authenticated Vipps sales unit. Disabled
until credentials are configured. The running VPS has not been changed.

## Required from Vipps

An organization must obtain a Login-enabled test sales unit and its client ID and
client secret. Vipps onboarding also supplies the sales-unit MSN and subscription
key (needed by other API operations). This minimal `openid` code flow does not
fetch userinfo, initiate payments, or request name, email, phone or national ID.
Register this exact redirect URI in the business portal:

`https://calendar.dev.demokratiloftet.no/auth/oidc/vipps/callback`

Use Vipps's test app/profile for the test environment. Portal acceptance of the
private redirect and end-to-end browser behavior still need testing. The browser
returning to this URL must be connected to the calendar's Tailscale network.

## Configuration and activation boundary

The Compose recipe forwards these optional server-only variables:

```dotenv
VIPPS_ENVIRONMENT=test
VIPPS_CLIENT_ID=
VIPPS_CLIENT_SECRET=
```

The reusable `vippsDefinition` factory defaults to test, rejects invalid settings,
uses the canonical issuer including its trailing slash, `client_secret_basic`,
RS256, `openid`, and Norwegian market selection. No network call occurs merely
by importing the preset. The calendar enables it only when credentials are set;
partial credentials fail startup. The isolated local sandbox rejects activation.

Do not add credentials to the VPS yet: its current egress planner only permits
private addresses. Activation also requires a separate reviewed outbound policy
for `https://apitest.vipps.no` (production uses `https://api.vipps.no`), plus the
same exact origin in `AUTH_FETCH_ROUTES_JSON`. Use a constrained HTTPS egress
proxy or equivalent origin-restricted policy supporting provider IP changes;
do not allow unrestricted Internet access, disable TLS verification, or route
public Vipps through the existing private-host pinning mechanism. This networking
work is pending the registered test client. No public calendar port is required.

## Behavior and trust

Sign in with AT Protocol, then choose Vipps under **Min konto**. The authorization
code flow requires state, nonce, S256 PKCE and recent authentication (`max_age=300`).
The returned signed ID token must pass issuer, audience, signature, expiry and
freshness checks. Keep these checks if a provider returns an incompatible token;
investigate against the registered client instead of relaxing validation.
Vipps Basic-auth interoperability and authentication freshness are still untested
against a real registered client.

Explicit confirmation saves a private issuer/subject-to-DID link. Tokens are
discarded. Linking is not a Vipps-only AT Protocol login: repository access still
requires AT OAuth. It does not prove club membership or authorize publishing.
No attestation issuer change is needed. A later issuer could consume a verified
link under a separate consent and claim policy. Vipps Login is not a certified eID.

## Sources checked 2026-09-17

- https://developer.vippsmobilepay.com/docs/APIs/login-api/login-api-quick-start/
- https://developer.vippsmobilepay.com/docs/APIs/login-api/api-guide/browser-flow-integration/
- https://developer.vippsmobilepay.com/docs/APIs/login-api/api-guide/overview/
- Public test discovery fetched successfully: https://apitest.vipps.no/access-management-1.0/access/.well-known/openid-configuration

Tests exercise path-based discovery, Norwegian market, PKCE, Basic client auth,
exact callback, signed identity verification and token disposal using synthetic
keys. Existing OIDC tests cover nonce/issuer/audience/expiry/signature/freshness
rejection, and service tests cover link ownership and confirmation.
