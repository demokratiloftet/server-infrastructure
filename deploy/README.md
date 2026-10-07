# Checked app deployment to the demo VPS

Application source belongs to its own private repository. GitHub Actions checks
PRs and main/master pushes. After CI passes, an enabled deploy job asks the VPS
to deploy exactly that commit. No PR job receives a deployment credential.

## Scope

| Repository | Default branch | Updated service |
| --- | --- | --- |
| `loftet-social` | `main` | `server-infrastructure` / `loftet-social` |
| `calendar-app` | `master` | `server-infrastructure` / `public-calendar` |
| `organisation-verifier` | `main` | `organisation-verifier` / `app`, if configured |

The original infrastructure branch, PDS images, PLC, PostgreSQL, gateway,
certificates and all volumes stay under operator control. The public calendar
uses `calendar-app/Dockerfile.public`; its old infrastructure snapshot remains
available. The local sandbox and attestation issuer are not deployed publicly.
The identity repository creates packages; consumers update their vendored
archives deliberately, not by silently changing a running shared library.

## Trust and credentials

Install reviewed `receive.py` as `/usr/local/sbin/loftet-deploy`, owned by root
and not writable from app containers. Each repository gets two separate keys:

1. An SSH **trigger key**, stored as GitHub secret `DEMO_DEPLOY_SSH_KEY`. Its public
   key in `/root/.ssh/authorized_keys` has `restrict,command="/usr/local/sbin/loftet-deploy REPOSITORY"`.
   It has no interactive shell, forwarding, PTY, arbitrary command or file upload.
2. A GitHub **read-only deploy key**, stored only on the VPS, used by that repo's
   source checkout. It cannot push, change settings or read another repository.

Pin the VPS host key in `DEMO_DEPLOY_KNOWN_HOSTS`, obtained through the existing
trusted SSH connection; do not trust a fresh unauthenticated `ssh-keyscan`.
Set `DEMO_DEPLOY_HOST` to the verified host. The receiver accepts only `deploy`
plus 40 lowercase hexadecimal characters and verifies the SHA is the current
remote default-branch head. Newer pushes make an old queued deployment fail closed.

Default-branch writers can change deployed code and workflows and are therefore
trusted operators. The forced command narrows credential scope; it does not
sandbox malicious code that an authorised maintainer merges. Use required CI,
review deployment changes, restrict write access, and revoke the dedicated keys
when maintainers or the server change. GitHub's private-repository protection
features depend on the organisation plan.

## Server layout and bootstrap

Python 3.12+, Git, Docker Compose, OpenSSH and curl are required. Existing live
configuration and healthy services must already be present. This receiver does
not bootstrap a new PDS or generate replacement identities.

```text
/var/lib/loftet-deploy/
  deploy.lock
  REPOSITORY/
    github-read-key       # 0600, unique read-only GitHub key
    source/               # Git checkout; SSH uses that key and pinned github.com host keys
    releases/FULL_SHA/    # source-only build contexts; no live environment files
    image.json           # Compose override selecting the checked image
    current.json         # deployed SHA/image and prior image
```

Create `source/` from the exact private repo and configure `core.sshCommand` with
its dedicated key, `IdentitiesOnly=yes`, and strict pinned host-key checking.
Before enabling the trigger, compare source with the running demo, back up the
app's durable storage and keys, record its current image ID, and set `current.json`
to `{ "sha": "REVIEWED_BASELINE_SHA", "image": "EXISTING_IMAGE_ID" }`.
The first reviewed deployment may use that baseline SHA to move from the manually
copied app into managed images. Never invent a baseline for an unknown deployment.

Set `DEMO_DEPLOY_ENABLED=true` only after bootstrap and acceptance checks. Run the
CI workflow on the default branch to test the complete path. Keep the default
`false` when cloning this setup for another environment.

## What a deployment does

A global VPS lock serializes all app builds/cutovers. The receiver fetches the
current branch, checks the requested SHA, and refuses automatic changes to
`deploy/`, `infra/`, Compose topology, the social SQL schema or verifier store.
It extracts the checked source into a separate release directory and builds
without live secrets. It then overlays only the selected image on the existing
approved Compose topology, runs `config --quiet`, and recreates only that app
with `--no-deps --no-build --wait`. Public apps also get an HTTPS smoke check.

Failed health/smoke checks restore the previous image. The previous image and
source release remain for operator rollback. There is no `down`, volume removal,
PDS upgrade, schema migration, DNS modification or whole-stack `up` in the script.
Failed SSH/Actions runs surface as failed workflows. Redeploy may require users
to sign in again; an app restart is not session-preserving for every auth mode.

The running app source is the recorded release/image. `/root/loftet-social`
continues to hold the approved gateway/topology and private `.env.vps`/`.runtime`.
Do not manually rebuild the old checkout expecting it to contain the deployed
application commit. Inspect `current.json` for the exact running source.

## Pause and rollback

```sh
gh variable set DEMO_DEPLOY_ENABLED --repo demokratiloftet/loftet-social --body false
```

This stops future automatic deploys; CI still runs. For an ordinary code rollback,
revert the change on the default branch and merge it through CI. For immediate
operator recovery, select the retained previous image in the repo's `image.json`
and use the same approved Compose wrapper and app service:

```sh
/root/loftet-social/deploy/compose.sh \
  -f /var/lib/loftet-deploy/loftet-social/image.json \
  up -d --no-deps --no-build --wait loftet-social
```

Update `current.json` to the restored image/source after a manual rollback and
keep automatic deploy paused until the branch and database compatibility are
reviewed. Do not restore database dumps for an ordinary image rollback.
A coordinated data restore can discard newer writes and is separate work.

## Infrastructure changes

`server-infrastructure` runs CI on every change but has **no unconditional
whole-VPS deploy**. PDS alpha updates, network/route changes, keys and volumes
require disposable acceptance, a coordinated backup and operator rollout using
the existing overlay runbooks. This prevents an app merge from accidentally
restarting databases or replacing the native authorization boundary.

`python3 deploy/test_receive.py` tests the forced-command parser. `actionlint`
validates workflow syntax locally. Actions use immutable commit SHAs; the secret
scanner binary is pinned by version and SHA-256. See
[GitHub secure use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
