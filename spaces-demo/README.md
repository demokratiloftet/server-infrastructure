# Private group noticeboard (Spaces alpha)

An opt-in addition to `feat/public-demo-private-federation`. A group owner posts
notices and grants/removes read access for other demo accounts. No calendar
integration, external accounts, federation, relay, notifications or chat service.
The app has no dependencies and no database: group configuration, membership and
notices live on a **separate operator-hosted Spaces PDS**. This is not the existing
calendar/social PDS, and users create separate demo accounts.

The frontend lives at `https://demo-calendar.${PARTITION}.${DOMAIN}/spaces/`.
The existing public gateway forwards only its enumerated frontend/API routes.
No additional public hostname, DNS record, port or certificate is needed.
`spaces-pds.${PARTITION}.${DOMAIN}` is an internal identity endpoint, not a public
route. Do not add a DNS record or Traefik router for it.

## Add to the VPS after the base demo is running

These commands prepare/start only the new services and recreate the gateway.
Do not interrupt the ongoing base-branch deployment. Use the same checkout,
project name and existing environment files once that deployment is complete.

```sh
python3 spaces-demo/configure.py       # once; preserves existing credentials
python3 spaces-demo/verify.py --config-only
sh spaces-demo/compose.sh build spaces-pds spaces-app public-gateway
sh spaces-demo/compose.sh up -d --no-deps --wait spaces-pds
sh spaces-demo/compose.sh up -d --no-deps --wait spaces-app
sh spaces-demo/compose.sh up -d --no-deps --wait public-gateway
python3 spaces-demo/verify.py
```

The private PLC and authoritative DNS must already be healthy. The overlay uses
private addresses `.21` and `.22` in the base demo subnet. It does not change
existing service definitions apart from enabling the gateway's `/spaces/` route.
It keeps the same gateway bind address, including loopback if the base demo has
not been opened yet. Recreating the gateway briefly interrupts frontend access
and clears its in-memory media sessions. It does not restart the calendar or PDS.

Once enabled, use `spaces-demo/compose.sh` for stack management; it includes all
four overlays. A base-only gateway recreation disables the route again. Never use
a plain `docker compose up` that omits the public-demo isolation overlay.

To disable just Spaces:

```sh
sh public-demo/compose.sh up -d --no-deps public-gateway
sh spaces-demo/compose.sh stop spaces-app spaces-pds
```

Do not use `down -v`. The new `spaces-pds-data` volume and ignored
`spaces-demo/.env` belong together. Preserve both, along with the existing PLC
database. Nothing mounts or migrates `pds_data`. Alpha upgrades must be deliberate:
pin a new digest, rebuild, and repeat disposable acceptance checks before touching
this demo volume. Upstream does not promise clean migrations.

## Try it

1. Open `/spaces/`, create a fictional demo account, then create `fjord-swimming`.
2. Publish a notice and keep the group's link. The name is a short lowercase slug.
3. In a second browser/private window, create another demo account.
4. As the owner, add that username as a reader and share the group link.
5. The reader can see notices. A third account with the same link is refused.
6. Remove the reader; their next refresh is refused and clears the displayed board.

Only owners publish or manage access. This deliberately demonstrates the smallest
useful private-group flow. There is no discovery directory or saved group list;
bookmark the group link. The board displays the latest 50 notices, and the owner
view shows up to 100 membership entries. Demo account emails are synthetic;
email delivery and password recovery are unavailable. Sign in again after two
hours or an app restart. No real identity or club membership is verified.

## Boundary and upstream status

- Upstream image: `ghcr.io/bluesky-social/atproto`, digest
  `sha256:4b19b376aa6164b62ede70bb35db79096c6dac9985cecb175e82022860a3d796`,
  built September 15, 2026, revision `158c439bdb7f3890e7cf8200ed3c291823fec336`.
  The published image is amd64 only; ARM development uses Docker emulation.
- Both new services have only the existing Docker internal network, authoritative
  private DNS, no host ports, no Traefik routes, read-only roots and no capabilities.
  Public PLC registration, crawlers and repository imports are not enabled.
- A small source-checked PDS patch allows only private PLC DID-document GETs through
  the SSRF guard. Other requests retain upstream SSRF protection. The network
  boundary independently denies public egress. The PDS uses the existing private PLC.
- Login uses real PDS account sessions through the backend, not OAuth. Passwords
  are forwarded once and not retained. PDS tokens stay in backend memory behind an
  opaque, HttpOnly, Secure, same-origin cookie scoped to `/spaces`.
- Reads use the actual protocol delegation-token/DPoP/space-credential exchange.
  Each read obtains a fresh credential; group data and credentials are not cached.
  Another member's data is never fetched using the owner's account token.
- The PDS enforces space membership. The app additionally restricts this demo to
  owner-authored notices. All requests target our fixed PDS; no user-provided URL
  is fetched. Raw XRPC, sync, exports, blobs and WebSockets are not publicly exposed.
- The gateway limits request bodies and rates. Signup/login share its ten-attempt
  per-IP hourly signup budget; this is intentionally a small demo. Anyone who can
  reach the frontend can create an account, but needs an owner's grant to read a group.
- Use synthetic data. Spaces is alpha, not end-to-end encrypted, and is not suitable
  for sensitive records. Authorized readers and host administrators can copy data.
  A fresh credential check stops subsequent app reads after removal; it cannot
  erase content already downloaded. Previously issued native space credentials
  may remain valid until expiry. This app never gives them to browsers.

Reference: [Spaces alpha announcement](https://atproto.com/blog/atproto-spaces-alpha),
[protocol proposal](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data).

## Verification

```sh
npm test --prefix spaces-demo
npm test --prefix public-demo
```

The standalone acceptance fixture has its own PLC/Postgres/PDS volumes, subnet
`10.249.93.0/24`, synthetic secrets and loopback HTTPS port `19443`. It uses the
existing `loftet-public-gateway:private-demo` image (build with the base demo's
wrapper first if absent), mounting the current gateway source for the check.
It never reads live environment files and cannot target production.

```sh
python3 spaces-demo/test/configure.py  # once; fails if already configured
sh spaces-demo/test/compose.sh build spaces-pds spaces-app
sh spaces-demo/test/compose.sh up -d --wait
node spaces-demo/test/smoke.mjs
sh spaces-demo/test/compose.sh exec -T spaces-app node --input-type=module - < spaces-demo/test/native.mjs
python3 spaces-demo/verify.py --test
sh spaces-demo/test/compose.sh down    # retains disposable data
```

The smoke test checks real signup, publication, member reads, outsider refusal,
owner-only changes, removal, logout, CSRF and gateway denials. It creates fresh
accounts on each run; repeated runs share the gateway's rate limit. The verifier
checks actual container networks, ports, volume separation, external IPv4/IPv6 TCP,
external DNS/UDP denial and unprivileged execution. It never prints resolved
configuration or secrets.

For browser checks, use a separate Chrome session with
`--host-resolver-rules=MAP demo-calendar.dev.demokratiloftet.no 127.0.0.1:19443`
and ignore only this fixture's disposable self-signed certificate. The Node smoke
client validates that certificate explicitly; production TLS verification stays on.

To verify merging with the base branch's full staging configuration, prepare its
fixture per `public-demo/README.md`, then:

```sh
python3 spaces-demo/configure.py --staging
python3 spaces-demo/verify.py --staging --config-only
```

`spaces-demo/compose.sh --staging` applies Spaces to that full staging project if
you want to run both demos together. The standalone fixture is sufficient to test
Spaces without starting the entire social stack.
