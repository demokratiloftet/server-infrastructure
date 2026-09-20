# Verification record — 2026-09-19

Branch: `feat/public-demo-private-federation`.

Tests used the separately named `loftet-public-demo-check` project, synthetic
accounts and isolated volumes. The production stack, firewall and DNS were not
changed. Builds and test runs were performed both on local Docker and the actual
Linux VPS, under `/root/loftet-public-demo-build`.

Passed:

- Pinned PDS derivative, rebuilt social gateway and vendored calendar images build
  on the VPS. All services in the test Compose project start successfully.
- Five boundary tests: validated tokens, authenticated/anonymous replication
  denial, path/host/origin bypasses, session-protected media and logout, required
  OAuth headers, scoped SSRF dispatch/fetch, private DNS including EDNS and local
  handle TXT proofs. These include multiple assertions per test.
- All 33 calendar unit tests, including explicit public-demo self-service opt-in
  and grant subject binding. Existing real-PDS grant/publish/revoke integration
  test passed in the separate local sandbox.
- Real public gateway acceptance: account signup; post/profile/image writes to
  the local PDS; local relay/AppView indexing; valid local handles; image URL
  rewriting and authenticated image retrieval; denial of anonymous posts/images,
  repository exports, service-auth and admin routes.
- Browser: social signup, onboarding, post publication and display, logout;
  calendar signup/login, OAuth consent/callback, self-grant and activity publication.
  Successful social page resources were restricted to the demo social and PDS
  origins. No public account or public post was created by these checks.
- Running topology: no host ports and only the internal network for data services.
  External IPv4/IPv6 TCP and direct UDP/TCP DNS blocked from PDS, PLC, AppView,
  calendar, gateway, relay and Jetstream namespaces. Private DNS works. Gateway
  application runs as UID 1000 with no effective, bounding or ambient capabilities.
- VPS isolation checks repeated after a gateway restart.
- Real VPS configuration rendered and passed preflight using existing settings,
  without printing or committing credentials.

Outstanding at the end of staging (resolved by the rollout record below):

- Consistent production backup and maintenance-window migration.
- Issuing the newly configured wildcard certificate with Traefik DNS-01. The
  audited VPS has individual certificates; preparation deliberately fails closed
  if asked to export a wildcard that does not yet exist.
- Public port/DNS cutover and acceptance from a machine outside Tailscale.

See [deployment guide](README.md) for reproduction, feature limits and rollback.
Synthetic test data is separate from production and can be retained for reruns.

## Live VPS rollout — 2026-09-20

Deployed implementation commit `372d0a6` on branch
`feat/public-demo-private-federation` in `/root/server-infrastructure`.

- Preserved existing named volumes, old calendar auth store and Tailscale state.
  Full volume backup was explicitly deferred by the owner for this POC.
  Restricted configuration snapshots and original targeted DNS records are in
  `/root/public-demo-rollout-2026-09-20`; previous local changes are in Git stash.
- Stopped legacy infrastructure/calendar containers. Removed only stopped
  infrastructure container definitions (without `-v`) to resolve Docker's old
  shared-network-namespace references during migration. Data volumes remain.
- Built the real configured images on the VPS. All enabled healthchecks pass.
- Issued a trusted `*.dev.demokratiloftet.no` certificate using existing Vercel
  DNS-01 configuration. Enabled the certificate export systemd timer.
- Published only the gateway at IPv4 TCP 443. Added exact `demo-social.dev` and
  `demo-calendar.dev` A records and updated exact `pds.dev` to `187.124.129.149`.
  Other private service and wildcard records were retained. No IPv6 HTTPS listener.
- Verified both apps via the public IP and then ordinary public DNS with normal
  TLS validation, without browser host overrides or certificate exceptions.
- Live synthetic signup, post/profile/image upload, own relay/AppView indexing,
  local handle resolution and authenticated image retrieval passed. Anonymous
  records/media/calendar contents and authenticated exports/service-auth/admin
  routes were denied. Public PDS firehose returns 404. Backend hostnames and
  an unknown Host sent to the public gateway return 404.
- Browser checks passed: calendar OAuth sign-in/consent, self-service demo grant,
  activity publication; social sign-in, existing content/avatar display and new
  post publication/display on the account profile. Synthetic test content is
  clearly labelled; existing content was retained.
- Runtime network/egress verification passed before public exposure and again
  after gateway recreation on port 443, including private PDS, PLC, AppView,
  calendar, gateway, relay and Jetstream namespaces.

Public URLs:

- https://demo-calendar.dev.demokratiloftet.no
- https://demo-social.dev.demokratiloftet.no

Anyone may register. Content requires login and remains in the local service
stack; public federation/export is blocked. Registered users can still view and
copy content, so this is not an invitation-only confidentiality boundary.

## Anonymous social browsing update — 2026-09-20

The social app now exposes an explicit allowlist of read-only AppView methods
and local images without a session. Anonymous AppView reads use the fixed private
AppView directly; authenticated requests retain PDS session validation. Repository
reads, writes, preferences and notifications remain authenticated. Sync, exports,
service-auth, admin endpoints and WebSocket replication remain denied. Calendar
content continues to require its OAuth session. Onboarding now states that anyone
can read and copy social content.

Validation: all five boundary tests passed, including distinct AppView routing,
wrong-method denial and anonymous write/private-account denial. Live public HTTPS
smoke passed signup, authenticated post/profile/image writes, local indexing,
anonymous post/image retrieval and authenticated export denial. Runtime topology
and IPv4/IPv6/DNS isolation checks passed after the gateway was recreated. A fresh
logged-out browser displayed the Discover feed and avatars using only our demo
services. Initial browser navigation timed out during bundle loading; subsequent
loading succeeded, and direct bundle downloads returned 200 in 1–3 seconds.

This supersedes the original rollout's login requirement for social content.
Anonymous visitors and bots may copy social content; federation remains disabled.
