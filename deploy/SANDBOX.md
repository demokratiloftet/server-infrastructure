# Private prototype applications

LOFT-98 adds opt-in registrations to the existing deployment receiver. Existing targets retain their Compose wrappers. New apps use independent Compose projects; the existing gateway, PDS, databases and application containers are not recreated.

The source template is [app-protospace](https://github.com/demokratiloftet/app-protospace). Its root is the reusable template and Hello Løftet example. Registration is operator-only; default-branch writers remain trusted to deploy code. Containers are not a security boundary for arbitrary untrusted contributors.

## Registration

For repository `REPO` in the `demokratiloftet` organisation:

1. Review the app Dockerfile, resource requirements and any storage/integrations. Reserve an unused loopback port and a hostname covered by the existing private wildcard DNS/TLS.
2. Copy the reviewed example in `deploy/apps/app-protospace/` to `/etc/loftet-deploy/apps/REPO/`, owned by root and not writable by app users. `target.json` contains exactly `branch` and `port` (the loopback port). Adapt Compose's loopback binding to the same port. Keep service name `app`, container port 3000, healthcheck and project name `protospace-REPO`.
3. Install the reviewed `deploy/receive.py` as root-owned mode 0755 `/usr/local/sbin/loftet-deploy`. Back up the previous receiver before replacing it.
4. Initialise `/var/lib/loftet-deploy/REPO/source/` as a Git repository with exact origin `https://github.com/demokratiloftet/REPO.git` and no stored credentials. Deliver the reviewed source commit with a Git bundle or a temporary repository-scoped token; never copy live secrets into it.
5. Build the reviewed full commit from a source-only archive into image `loftet-deploy/REPO:SHA`, with build argument `APP_REVISION=SHA`. Create `image.json` selecting that image for service `app`.
6. Start only the new project:

   ```sh
   docker compose -p protospace-REPO \
     --project-directory /etc/loftet-deploy/apps/REPO \
     -f /etc/loftet-deploy/apps/REPO/compose.yaml \
     -f /var/lib/loftet-deploy/REPO/image.json \
     up -d --no-build --wait
   ```

7. Verify loopback health, then record actual source SHA and image in `current.json`. Do not invent a baseline. The gateway labels register an exact hostname with the existing **private Traefik** on the Tailscale sidecar. The example uses `https://app-protospace.dev.demokratiloftet.no`. Existing wildcard DNS points to the sidecar's tailnet address and its wildcard certificate covers this name. No DNS change, certificate copy or Traefik restart is needed. Set unique router/service names and hostname when copying this topology for another app.
8. Verify the URL from a separate tailnet client with valid TLS. Send the same hostname directly to the public VPS address and verify that it is denied. Inspect container ports, networks, user and capabilities. Existing tailnet policy must allow participants to the private proxy on port 443. No Tailscale Serve/Funnel mapping is created.
9. Generate a **new per-repo** SSH trigger key. Append only its public key to root's `authorized_keys` with `restrict,command="/usr/local/sbin/loftet-deploy REPO"`. Install the private key as GitHub secret `DEMO_DEPLOY_SSH_KEY`, and the server's already-verified SSH host key as `DEMO_DEPLOY_KNOWN_HOSTS`. Set `DEMO_DEPLOY_HOST`; enable `DEMO_DEPLOY_ENABLED=true` only after acceptance. Never use the operator's SSH key in Actions.
10. Trigger the app's CI on the default branch and verify `current.json` and `/health` report the checked commit.

The global existing deploy lock serializes changes. The runtime Compose comes from `/etc`, not the app's commit. GitHub's short-lived read token is transported as in the existing deployment protocol. A failed container healthcheck or loopback smoke test restores the previous image. Application merges cannot create another registration or change DNS or shared topology.

The app has an internal-only Docker network, no ports or volumes, uid 1000, dropped capabilities, read-only root filesystem, 256 MiB memory, 0.5 CPU, 100 PIDs and rotating logs. A fixed TCP gateway forwards loopback:3210 to `app:3000`; only the gateway joins the existing `server-infrastructure_tailnet-egress` network shared with the private proxy sidecar, with 64 MiB / 0.25 CPU and a read-only mount of the operator-owned `gateway.mjs`. Install that file mode 0644; Compose and registration can remain 0600. Docker does not publish ports from this internal-only app network, so the gateway is necessary. Ordinary app deploys recreate only `app`. Docker's host/DNS and the fixed proxy are trusted; internal networking is not claimed to prevent every possible egress channel. Do not connect the app to shared PDS/database networks to fix connectivity.

## Rollback and removal

Pause new jobs with `DEMO_DEPLOY_ENABLED=false`; this does not cancel a running job. Coordinate with the global deployment lock. For code rollback, select `previous` from `current.json` in `image.json`, run the same Compose command with `--no-deps --no-build --wait app`, then update `current.json` to match the restored SHA/image. Keep the previous image/release. A normal rollback does not restore databases.

To retire the example, disable deploy and stop only the `protospace-app-protospace` project; Traefik removes its discovered route when the gateway stops. Do not stop shared infrastructure or delete the external ingress network. Revoke its trigger key and GitHub secrets when retiring a registration.

Public publishing remains an explicit gateway/DNS change. No Funnel or public listener is enabled by this addition.
