# Public demo with private federation

This opt-in overlay opens the **calendar and social app**, with self-service accounts
on the existing PDS. It preserves the PDS/PLC identities and data volumes. It does
not connect the deployment to public ATProto services.

The gateway defaults to **127.0.0.1:8443**. Applying this branch alone does not
publish anything. Use all three Compose files through `public-demo/compose.sh`.
A later plain `docker compose up` would restore the old network configuration.

## Boundary

- Public: three exact HTTPS hosts (`demo-social`, `demo-calendar`, `pds`) under
  `${PARTITION}.${DOMAIN}`. Landing pages, signup and login are available to anyone.
- Selected social feeds, posts, profiles and images are readable without login.
  Posting, interactions, preferences and notifications require a real PDS session. Calendar data
  requires its OAuth browser session. Anonymous calendar state contains no records.
- PDS sync/export/firehose, admin, account imports, external service-auth and
  arbitrary XRPC methods are denied, including for signed-in accounts. WebSocket
  upgrades are refused. PLC, AppView, relay, Jetstream and feed generator have no
  public gateway routes or host ports.
- Content services use one Docker `internal` network and authoritative private DNS
  with no forwarding. The public gateway denies new external IPv4/IPv6 connections
  before dropping its firewall capabilities and switching to UID 1000.
- Tailscale/Traefik retains its separate network for administration, DNS-01 and
  certificate renewal. It is not the public listener. Host administrators remain
  trusted; this is not isolation from a compromised VPS administrator.
- PDS development mode is off, SSRF protection and rate limits are on. A pinned
  derivative permits only the operator's exact calendar metadata GET, local PLC
  DID GETs, and local AppView XRPC proxy. Everything else uses upstream SSRF rules.
- Social source is pinned and rebuilt for this PDS. Browser fetch/CSP restrict
  service calls to the demo. Public chat, GIF, video and external link previews are
  unavailable. Onboarding skips public recommendations and automatic public follows.
- Calendar publishing still verifies the issuer's grant. The opt-in demo shortcut
  issues/revokes grants only for the current user and predefined synthetic clubs.
  It does not verify real club membership. Shared admin routes are unavailable.

Anyone can read and copy social posts and images without registering, including
bots and search engines. Anyone can register to participate.
This is **private infrastructure and no automatic public federation**, not
confidentiality from everyone on the internet. Content is delivered to participants'
browsers. Accounts belong to this private PLC and are not public Bluesky accounts.
Email delivery/password-reset services are not configured; keep demo data synthetic.

## Files and prerequisites

Requires the existing VPS checkout with its `upstream/` submodule, Docker Compose
support for `!override`/`!reset` (VPS uses 5.5.1), Python 3,
existing `.env` and `/root/calendar-app/.env.vps`. Traefik must obtain a wildcard
certificate via the existing Vercel DNS-01 credentials before the gateway starts. Existing issuer/organiser accounts and the feed publisher DID
must exist. `prepare.py` fails instead of inventing replacements.

The calendar is a vendored, committed snapshot; see `calendar/PROVENANCE.md`.
Uncommitted sibling calendar changes are not included. The public OAuth store uses
its own `public-calendar-auth` volume and encryption key: users log in again at the
new URL. The original calendar store is preserved.

## Reproducible isolated VPS acceptance test

This creates a separate `loftet-public-demo-check` project, synthetic credentials,
self-signed TLS and new volumes. It publishes only loopback port 18443. It does
not read production credentials, use Tailscale or edit DNS. Do not run it with
production project names or volumes.

```sh
npm ci --ignore-scripts
npm test
python3 public-demo/test/configure.py  # first run only; keep generated credentials
python3 public-demo/preflight.py --staging
sh public-demo/test/compose.sh build pds public-calendar public-gateway private-dns tailscale-traefik
sh public-demo/test/compose.sh up -d --wait pds relay bsky
python3 public-demo/test/provision.py
sh public-demo/test/compose.sh up -d --wait
python3 public-demo/register-relay.py --staging
sh public-demo/test/smoke.sh  # Linux VPS; local Node can run dist/public-demo/test/smoke.js
python3 public-demo/verify.py --staging
npm test
```

Browser testing uses a dedicated Chrome session with
`--host-resolver-rules=MAP *.dev.demokratiloftet.no 127.0.0.1:18443` and ignores
**only this disposable test certificate**. Use canonical HTTPS URLs, not URLs with
`:18443`, because Host and OAuth origins are intentionally strict. Do not disable
TLS verification in the real deployment. Test fixtures target the current VPS's
`dev.demokratiloftet.no` domain.

Use `PUBLIC_DEMO_TEST_PROJECT` for a fresh named set of volumes when needed;
the fixed test subnet and port still require the other fixture to be stopped.
Keep generated credentials with their volumes.

Stop the test with `sh public-demo/test/compose.sh down`. This preserves synthetic
data for repeat tests; no production volumes are selected. Generated credentials,
keys and node_modules are gitignored. Test accounts/posts remain in test volumes.

## Prepare the existing VPS, without opening it

In `/root/server-infrastructure` on this branch:

```sh
python3 public-demo/prepare.py --configuration-only
python3 public-demo/preflight.py
sh public-demo/compose.sh build pds public-calendar public-gateway
```

Configuration preparation imports existing issuer credentials. Certificate export
is a separate step into a restricted, ignored directory. On an initial deployment, the new wildcard must first be issued by Traefik.
The live rollout issued it on 2026-09-20; see VERIFICATION.md. It neither starts services nor
changes DNS. Keep `.env`, `public-demo/.env`, both calendar auth stores and all
private keys backed up with the database volumes. Never print resolved Compose
configuration: it contains credentials.

## Migration during an agreed maintenance window

1. Record the currently deployed commit and preserve `.env`, `certs/`,
   `public-demo/.env` and the old calendar configuration. Stop the old calendar
   project using its existing deployment wrapper. Stop **all** old infrastructure
   containers (including `private-legacy` social and one-shot bootstrap services).
   `docker compose stop` from the old checkout is appropriate. Do not use `down -v`.
2. With writers stopped, take a consistent backup of **all** this project's named
   volumes (Postgres, PDS, PLC if separate, relay, feed generator, Tailscale state,
   and calendar auth volumes), plus the files above. Verify backup readability.
   Record volume names via `docker volume ls`; do not assume only the PDS matters.
   For this POC the owner explicitly deferred a full volume backup; see the live
   rollout record. Configuration snapshots do not replace a data backup.

   If Docker reports an old container is not connected to its former network,
   verify all containers for the exact infrastructure project are stopped, then
   remove only those stopped container definitions with `docker rm` (no `-v`).
   Preserve all named volumes and unrelated projects before retrying.

3. Bring up the branch using the public overlay, still bound to loopback:

   ```sh
   sh public-demo/compose.sh up -d --wait traefik pds relay bsky public-calendar
   # The PDS router explicitly requests the new wildcard using DNS-01.
   # Once issuance completes, export it. This fails closed if it is not available.
   python3 public-demo/prepare.py --certificates-only
   sh public-demo/compose.sh up -d --wait
   python3 public-demo/register-relay.py
   python3 public-demo/verify.py
   ```

   Existing relay registration persists; the registration command is idempotent.
   The normal external DNS/bootstrap jobs are deliberately excluded. Do not enable
   `private-bootstrap` or `private-legacy` on this deployment.

4. Check both apps via an SSH tunnel and dedicated browser host mapping, as above
   (map to forwarded port 8443). Test a synthetic signup, OAuth consent, activity
   publishing, social post/image, logout, anonymous social browsing and private API denial. Confirm legacy
   calendar/social containers are stopped and have no alternate public routes.
5. Install certificate refresh after verifying the expected checkout path:

   ```sh
   cp public-demo/systemd/loftet-demo-certificates.* /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now loftet-demo-certificates.timer
   systemctl start loftet-demo-certificates.service
   ```

   Traefik renews the wildcard by DNS-01; the timer exports it hourly. The gateway
   reloads it without restart. Monitor timer failures and certificate expiry.

6. Only when ready to publish: set `DEMO_BIND_IP='0.0.0.0'` and
   `DEMO_HTTPS_PORT='443'` in ignored `public-demo/.env`, verify the port is unused,
   then `sh public-demo/compose.sh up -d --no-deps public-gateway`.
   Allow TCP 443 through the VPS/provider firewall. Keep SSH/Tailscale admin policy.
   Set the three exact public A records to the VPS IPv4 address. Keep PLC, relay,
   Jetstream, AppView, ozone, feedgen and administration DNS private. Do not publish
   wildcard aliases or AAAA records: this overlay's listener is explicitly IPv4.
   Preserve internal DNS mapping to Traefik's private address.
7. From a machine outside Tailscale, repeat signup/login and verify denied routes
   return 401/404 even with a valid token. Test the VPS IP, unknown Host and any
   existing IPv6 address for accidental listeners. Restart the gateway and repeat
   `verify.py`; its firewall must remain effective. Do not run the disposable
   `dist/public-demo/test/smoke.js` against production: its target is intentionally the test stack.

Do not expose a raw PDS/Traefik port as a shortcut. Do not use a public tunnel that
bypasses this gateway. Docker-published ports need provider/host Docker-aware
filtering; do not rely on an unrelated UFW INPUT rule alone.

## Rollback

First close public ingress (set gateway back to loopback or stop it) and revert the
three DNS records. Disable the certificate timer if abandoning this deployment.
Stop the overlay with its wrapper. Restore the recorded old checkout and its normal
Compose configuration, and start the old infrastructure and calendar wrappers.
Never delete volumes. Restore the consistent backup only if the newer deployment
has made incompatible database changes; restoring it also discards later writes.
Do not restore a raw public PDS route during rollback. Keep the old environment
files and auth keys with their corresponding volumes.

## Verification and maintenance

`npm test` under `public-demo` checks gateway policy, token validation, public social reads and private writes,
SSRF exceptions and private DNS. The calendar's `npm test` verifies auth/grants;
`npm run test:integration` uses the existing disposable local sandbox at port 2583;
`npm run verify` checks this branch's isolated staging network. The actual public
stack's signup/post/AppView acceptance is `dist/public-demo/test/smoke.js`.

PDS and social patches deliberately fail the build if pinned source no longer
matches. On upstream upgrades rerun the full suite and browser flows. The gateway
allowlist must be reviewed when adding a feature; never replace it with
`/xrpc/*`. Image presets currently serve the original local image, without AppView resizing.
Media sessions are held in memory; a gateway restart may require users
to sign in again. Rate limits are per observed source IP (300 requests/minute,
10 signups/hour); do not put another proxy in front without reviewing IP trust.

## Rebuild gateway code with reviewed existing browser assets

The full `Dockerfile` rebuilds the pinned upstream Bluesky client. For a gateway
maintenance release with unchanged client patches, `Dockerfile.gateway` accepts a
locally tagged, reviewed gateway image via `--build-arg SOCIAL_ASSETS_IMAGE=...`.
It copies only `/social/web-build`, then compiles current gateway code into a fresh
Node 24 image. Record the source image ID and source commit. Never use this shortcut
when changing `patch-social.ts` or `browser-runtime.ts`; verify the full build then.
Keep the active Løftet overlay and its compiled gateway adapter during VPS rollout.
