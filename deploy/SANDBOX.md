# Hackathon apps: one registration, then push to deploy

LOFT-98 reuses the existing VPS, private Traefik, DNS provider, certificate resolver and forced-command deployment receiver. The app template is [app-protospace](https://github.com/demokratiloftet/app-protospace). Participants use **pnpm**, GitHub and Tailscale. They do not receive VPS shell access.

Each repository gets `https://<repo>.hackaton.demokratiloftet.no`. Separate subdomains avoid frontend base-path changes and give apps distinct browser origins. They are not separate sites for every cookie/CSRF policy: applications still need host-only cookies and proper authorization. DNS uses the requested spelling `hackaton`.

## Operator only: register a reviewed repository

Participants do not run this command. They create an app repository and give its name to the VPS operator. The operator registers it once; participants then deploy by pushing to `main`, without further operator involvement for ordinary app updates.

The identity path below is the operator’s existing local SSH key, not a shared participant credential. It stays on the operator’s machine and is never uploaded to GitHub. Registration generates a different, per-app key for Actions, restricted to deploying that app. If only one person has operator access, new registrations depend on that person; this version does not provide self-service registration.

Use a private `demokratiloftet` repository created from the template, with `main` as its default branch. Review its Dockerfile, code, data needs and trusted writers first.

```sh
python3 deploy/register.py my-app --identity /path/to/your/operator-ssh-key
```

Requires Python 3, Git, GitHub CLI with repo administration rights, operator SSH access and a previously verified VPS key in `~/.ssh/known_hosts`. The default VPS is `187.124.129.149`; `--host` and `--known-hosts` can override these.

The command clones the repo, bundles only committed source, allocates a free loopback port, creates the root-owned topology, builds and starts the app, establishes its baseline and creates a unique forced-command trigger key. It configures Actions secrets/variables and dispatches the workflow. Verify the resulting Actions run and the private URL before handing it to participants.

Registration refuses to overwrite existing or partial registrations and caps the sandbox at ten apps. If bootstrap fails, inspect `/etc/loftet-deploy/apps/<repo>` and `/var/lib/loftet-deploy/<repo>` before recovery. A failed start stops only the new Compose project. If GitHub configuration fails after startup, the app may already run; disable its deploy variable, remove the `sandbox-<repo>` trigger line and issue a fresh key during recovery. Do not blindly rerun registration or delete unrelated state.

## Bootstrap shared services once

Install the reviewed `deploy/receive.py` as root-owned mode 0755 `/usr/local/sbin/loftet-deploy`, backing up the previous receiver. Keep `deploy/sandbox.py`, `gateway.mjs`, `prepare-hackathon.py` and `pds-account.py` together in an operator-only directory. Existing registrations remain supported.

Build the existing pinned Spaces PDS recipe from the reviewed infrastructure checkout:

```sh
docker build -t loftet-hackathon-pds:reviewed -f spaces-demo/Dockerfile.pds .
python3 deploy/prepare-hackathon.py --dns \
  --pds-image "$(docker image inspect loftet-hackathon-pds:reviewed --format '{{.Id}}')"
```

The bootstrap creates `hackaton` and `*.hackaton` A records pointing to the existing private proxy (`100.83.205.99`). It refuses conflicting DNS records. The existing Traefik DNS-01 resolver issues a wildcard certificate from the new gateway labels; no public listener or Funnel is added. TLS/DNS propagation is asynchronous; test HTTPS separately after startup.

Shared services live in Compose project `hackathon`, under `/etc/loftet-deploy/hackathon`:

- A **separate test PDS**, with its own `hackathon-pds-data` volume and root-only secrets. Invites and rate limits are enabled, SSRF protection remains enabled, crawling/repo imports are disabled.
- A fixed TCP bridge to the existing private PLC directory. New synthetic DID entries use that common directory; the existing PDS accounts/volumes are not reused or modified.
- A private PDS ingress at `https://pds.hackaton.demokratiloftet.no`.

No existing PDS, database, proxy or application container is recreated by bootstrap. Only the fixed PLC bridge joins the existing core network. Apps never join it.

Create one synthetic team account on the VPS:

```sh
python3 deploy/pds-account.py team-name
```

Credentials remain in `/etc/loftet-deploy/hackathon/accounts/team-name.json`, mode 0600; stdout only names the file. Deliver access privately. Never share the PDS admin password. The template includes `pnpm pds:demo`, a write/read/delete check with a team account. Browser OAuth registration, shared SSO and Spaces delegation are separate integration work; do not disable SSRF protection to bypass them.

Back up the test PDS volume and its secrets together if demos should survive the event. Never use `down -v` for a normal restart. This is disposable test infrastructure, not a production data service.

## Runtime and deployment boundaries

`deploy/sandbox.py` generates the approved topology; application Compose files are ignored on the VPS. App containers run as uid 1000, read-only root, no capabilities, no host mounts or published ports, 256 MiB RAM, 0.5 CPU, 100 PIDs, 16 MiB temporary storage and rotating logs. Each has its own internal Docker network.

A fixed, operator-owned gateway joins that network and the existing private ingress. It forwards only to the app on port 3000 and, when enabled, to the shared test PDS on port 3001. `PDS_URL=http://gateway:3001` and the canonical `PDS_PUBLIC_URL` are non-secret configuration. PDS credentials belong to the app/user, not the deployment framework. The optional service network contains no existing production databases.

The per-repo SSH key permits only `/usr/local/sbin/loftet-deploy <repo>` with `deploy <full SHA>`. It cannot open a shell, forward ports, select another repo, modify registration or publish an app. A short-lived GitHub `contents:read` token fetches the repository; no PAT or operator key is stored in Actions. Runtime topology is read from `/etc`, never from app commits.

Default-branch writers are trusted to deploy code and edit their workflows. Containers are not a security boundary for arbitrary hostile participants. Builds still run on the VPS from a source-only archive, under the shared deployment lock; builds do not have a hard memory quota. Resource limits above apply to runtime containers. Use separate build workers/VM isolation before allowing untrusted submissions or scaling beyond a small, trusted hackathon.

The receiver accepts only current default-branch HEAD, checks protected deployment/schema paths, builds the image and updates only the app service. Failed startup/health restores the previous image. Routing, secrets, PDS, gateways and existing apps remain unchanged by ordinary deploys. Database migrations are not automatically rolled back.

## Existing example and public access

The example uses `app-protospace.hackaton.demokratiloftet.no`; its old `app-protospace.dev.demokratiloftet.no` URL remains an alias. The apex `hackaton.demokratiloftet.no` is an alias for this start page. New app registrations need no further DNS or certificate changes.

Public publication remains a reviewed operator change to the existing public gateway's exact host allowlist, routing/firewall, TLS and DNS, following the app's `docs/public-apps.md`. Automatic public publication is not implemented. Never point the wildcard at the public IP or forward the complete private proxy/PDS publicly to publish one app. Keep other apps and the test PDS private.

## Rollback and retirement

Disable `DEMO_DEPLOY_ENABLED` and coordinate with `/var/lib/loftet-deploy/deploy.lock`. Select `previous` from `current.json` in `image.json`, run the app's Compose command with `--no-deps --no-build --wait app`, verify health/revision and update the deployment record. Retain the old image; persistent data is separate.

To retire an app, disable deployment, stop only `protospace-<repo>`, revoke its trigger key and GitHub secrets, then remove reviewed app-specific state. Do not delete shared ingress or service networks. Stop the dedicated `hackathon` project only when all users of the shared PDS are finished, retaining volume/secrets if recovery is wanted.
