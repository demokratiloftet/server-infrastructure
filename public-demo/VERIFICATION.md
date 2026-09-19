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

Still part of the actual rollout, not claimed as completed:

- Consistent production backup and maintenance-window migration.
- Issuing the newly configured wildcard certificate with Traefik DNS-01. The
  audited VPS has individual certificates; preparation deliberately fails closed
  if asked to export a wildcard that does not yet exist.
- Public port/DNS cutover and acceptance from a machine outside Tailscale.

See [deployment guide](README.md) for reproduction, feature limits and rollback.
Synthetic test data is separate from production and can be retained for reruns.
