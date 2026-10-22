# Public hackathon apps — operator guide

The selected app websites are public HTTPS. Their PDS remains private at
`https://pds.hackaton.demokratiloftet.no`; local development against it still needs
Tailscale. Public visitors do not need Tailscale. Browser OAuth against that private
PDS is not enabled by this change.

| Public host                                    | Fixed HTTP bridge   | Published API                               |
| ---------------------------------------------- | ------------------- | ------------------------------------------- |
| `app-protospace.hackaton.demokratiloftet.no`   | `10.249.99.11:3000` | greeting, PDS availability                  |
| `sports-publisher.hackaton.demokratiloftet.no` | `10.249.99.12:3000` | read event; password login, publish, logout |
| `sports-viewer.hackaton.demokratiloftet.no`    | `10.249.99.13:3000` | read event only                             |

Each also permits its static UI/assets and health endpoint. The gateway allows
exact paths and methods, bounds requests/responses and concurrency, applies rate
limits, rejects cross-origin writes and Host/SNI mismatches, and refuses protocol,
operator and WebSocket routes on these hosts. It never accepts a caller-selected
upstream. The sports publisher retains its own session and password checks.
Publicly displayed test data can be copied even though the PDS cannot be crawled
through these routes.

## Isolation

`public-hackathon.py` defines three small read-only, unprivileged TCP bridges.
Each joins only its own app's internal sandbox plus `hackathon-public`
(`10.249.99.0/24`, internal). Each forwards port 3000 to its own app, with no PDS
proxy. None has a public port, host/Docker access, TLS keys or verifier secrets.
Application containers retain their existing resource limits and isolated networks.

The existing HTTPS edge joins `hackathon-public` at `10.249.99.2`. Its firewall
permits only the three bridge IPs on port 3000. It has the hackathon TLS certificate
and exact app allowlist; no new connections to org-verifier are introduced.
The organisation-verifier container, networks, image, environment, credentials,
volume and background worker are unchanged. Its existing operator authentication
continues to protect its UI/API. A shared VPS still shares host availability;
container isolation is not a promise of separate physical infrastructure.

Exact app A records point to `187.124.129.149`. The apex `hackaton` and wildcard
`*.hackaton` still point to the private Tailscale proxy. PDS/PLC/relay/Jetstream
publication is not part of this setup. `hackathon-hello` remains private.

## Installed files and maintenance

- Bridges: `/etc/loftet-deploy/public-hackathon/compose.json`, project `public-hackathon`.
- Operator edge override: `/etc/loftet-deploy/public-hackathon/edge.json`.
- The existing `/root/loftet-social/deploy/compose.sh` loads this override after
  infrastructure runtime selection; preserve this addition when updating it.
- Gateway adapter: the source revision and compiled bundle hash are recorded in
  `/etc/loftet-deploy/public-hackathon/deployment.json`. The infrastructure
  `current.json` also records this adapter and the backup path. Its older
  `runtime.yaml` is overlaid, not replaced.
- Certificate: `tls/tls.json`, readable only by root and UID 1000. Only the hackathon
  wildcard is extracted from Traefik's ACME store; apps do not receive it.
- Operator helper/source patch: `/root/loftet-public-hackathon-20261015/`.
- Backup: `/root/loftet-rollbacks/public-hackathon-20261015/`.

Run `python3 /root/loftet-public-hackathon-20261015/public-hackathon.py tls` to refresh
the exported certificate. `loftet-hackathon-certificates.timer` runs this hourly;
the gateway reloads valid certificates every minute without restarting.
The helper's `dns` action publishes only the three explicit records and refuses
conflicting values. `remove-dns` removes those exact public records, restoring the
private wildcard behavior. It never changes wildcard or PDS DNS.

## Publish another app

First register/deploy it using `SANDBOX.md`, privately. Review its HTTP endpoints,
authentication, secrets and resource needs. Add its exact host/path/method policy
and fixed IP to `loftet-social/deploy/hackathon.ts` and the matching firewall rule
in `deploy/entrypoint.sh`. Add a dedicated bridge and exact DNS record in this
repo's `public-hackathon.py`. Test forbidden protocol/operator routes, auth and
cross-origin behavior before deploying the edge. Rebuild from the current recorded
gateway source so verification and other existing routes are preserved.

Validate the merged Compose configuration: only `public-gateway` may change among
existing services. Start the new bridge, then recreate only the edge with
`--no-deps --no-build --wait`. Check real TLS using `curl --resolve HOST:443:187.124.129.149`
before publishing DNS. Verify org-verifier still returns 401 anonymously and its
container ID/image/start time remain unchanged. Publish DNS last.

## Rollback

First run the helper's `remove-dns` action. Restore only the saved `compose.sh` from
the backup and use it to run `up -d --no-deps --no-build --wait public-gateway`.
That selects the previous runtime adapter and removes the new edge attachment;
then restore the saved infrastructure `current.json`. Check the verifier and
legacy app routes again. The unused bridges can be stopped separately afterwards.
Do not run whole-stack `down`, delete volumes, or recreate org-verifier/PDS.

## Source status

The gateway change is committed locally in `loftet-social` on
`feat/public-hackathon-apps`; its exact source patch is also retained on the VPS.
It has not been pushed: that repository's `AGENTS.md` requires an explicit push
request. The live gateway deployment is an operator rollout, independent of app CI.
