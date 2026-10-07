# Private VPS demo

Calendar: https://calendar.dev.demokratiloftet.no
Synthetic identity provider: https://identity.dev.demokratiloftet.no
Both require the existing Tailscale network. No app host ports are published.

SSH: `ssh -i ~/.ssh/hostinger root@187.124.129.149`
Application directory: `/root/calendar-app`.

Start/update only the calendar project:

```sh
cd /root/calendar-app
docker compose --env-file .env.vps -f compose.vps.yaml -f compose.tailnet.yaml up -d --build --wait
```

Do not run `down -v`: preserve `loftet-calendar-demo_auth-data` and the
`AUTH_ENCRYPTION_KEY` in `.env.vps` together in private backups. Existing PDS
storage holds events and synthetic grants. Back up that stack separately.
Restart calendar after its configured PDS IP or private proxy IP changes.
`PRIVATE_PROXY_IP` defaults to the current Traefik tailnet IP, 100.83.205.99.

The root-only `.secrets/demo-access.json` contains the organiser's login password
and demo administration code. A private laptop copy is at
`calendar-app/.secrets/vps-demo-access.json`. These must never enter Git or images.
Account provisioning is in `infra/provision-vps-demo.py`; use it only for this
specific existing private PDS. It preserves previously generated credentials.

Sign in with the organiser handle and full password through AT Protocol.
App passwords in `.env.vps` are for synthetic seeding/issuer operations.
**Om demoen** takes `demoAccessKey`, then exposes example events and grant/revoke
controls. Real identity providers are not configured. **Demo-identitet** uses
fictional people and does not prove membership or grant publishing authority.
Its sessions and signing keys reset on restart; restart unfinished linking flows.

Validation on 2026-09-17: healthy containers, valid HTTPS over tailnet, no published
ports, public-IP HTTPS unreachable, restricted IPv4/IPv6/DNS egress, zero app
capabilities, and all 19 unit tests plus local PDS integration/isolation checks.

Browser checks also passed: real private-PDS OAuth, OIDC linking with explicit
confirmation, OAuth-backed activity publication, persistent login and link after
calendar restart, and logout. Existing Bluesky still responds HTTP 200.
