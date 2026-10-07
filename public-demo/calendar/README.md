# Loftet — activity calendar demo

A working Norwegian calendar built on the existing private AT Protocol sandbox.
Run it locally, rebuild from TypeScript, then deploy the compiled image
beside the VPS stack. Events and permissions live in the PDS; private OAuth state and identity links
live in an encrypted SQLite volume. Node.js 24.17.x, Docker Compose required.

## Run locally

Keep these sibling directories together:

```
demokratiloftet/
  local-sandbox/
  calendar-app/
```

Clone both private repositories next to each other:

```sh
gh repo clone demokratiloftet/local-sandbox
gh repo clone demokratiloftet/calendar-app
cd calendar-app
npm ci
```

If the PDS is **not already running**, start it first:

```sh
cd ../local-sandbox
npm run up
cd ../calendar-app
```

Do not recreate a running PDS to start the calendar. Its data is ephemeral and
its accounts, DIDs and records disappear on restart.

```sh
npm run dev
```

Open **http://127.0.0.1:3000** (use that exact hostname). Choose **Om demoen**,
enter `local-demo-only`, and click **Legg inn eksempelaktiviteter**. The seed
writes four synthetic events and grants both fictional clubs publishing
permission. It does nothing if demo events already exist; it never resets data.

Edit `public/*.ts` for the interface and `src/*.ts` for backend behavior.
Run `npm run dev` again to compile and rebuild after changes, then refresh the
browser. Containers run compiled code from `dist/`; source directories are not
mounted over the running build. Rebuilds preserve the private OAuth volume and
identity links. The shared demo-admin cookie is process-local and requires login
again after a restart.

```sh
npm run logs
npm test                  # issuer, subject, scope, expiry, tampering, outage
npm run test:integration  # creates separate disposable test accounts in local PDS
npm run verify            # app isolation AND existing PDS/PLC verification
npm run down              # calendar only; does not stop/reset the PDS
```

## Five-minute demonstration

1. Browse the sample events; try search, activity/club filters and month view.
2. In **Om demoen**, grant Fjord idrettslag permission if it lacks permission.
3. **Logg inn** with `organiser.test`. Enter `local-sandbox-only` only on the
   PDS login screen, then approve access. **Opprett aktivitet**: enter name,
   category, times, place and description.
4. Publish. Open the activity and expand **Se AT Protocol-posten** for its URI,
   CID and stored event JSON. The event is in the organiser's repository.
5. In **Om demoen**, revoke Fjord's permission. Its existing events remain, but
   their current permission is no longer confirmed. New publication is blocked
   in the form and enforced again on the server.
6. Grant again to demonstrate a new permission record. Old event references do
   not silently acquire that new permission. Publish a new event to use it.

The browser refreshes status every 30 seconds when no dialog is open. Publication
always checks the PDS again. A PDS outage blocks publication; it never falls back
to a cached grant. The demo serializes its own writes, but cannot provide an
atomic transaction across two independent AT Protocol repositories or prevent
writes through another client.

An independent read-only CLI consumes the same claim without the calendar server
or account passwords. Copy the two DIDs from **Teknisk innsyn**:

```sh
npm run verify:claim -- <issuer-DID> <organiser-DID> fjord
```

It exits 0 for valid, 1 for rejected/unavailable, 2 for incorrect arguments.

## What is real, and what is simulated

Implemented:

- Real PDS account sessions, repository writes, paginated reads and deletion.
- `community.lexicon.calendar.event` event records, with a `loftet` extension.
- Issuer-owned, scoped, expiring public demo claims; deletion for revocation.
- Validation shared by calendar and independent CLI.
- Responsive list/month interface, filtering, creation and record inspection.
- AT Protocol OAuth login and OAuth-authorized personal event publication.
- Reusable `@loftet/auth` package: private OIDC linking, confirmation, unlink and logout.
- Persistent encrypted auth state, opaque HttpOnly cookies and origin/host checks.
- A separate demo-admin access code for synthetic issuer controls.
- Restricted local containers, a separate VPS Compose recipe and health checks.

Intentionally not implemented:

- Real Idrettens ID, BankID, Vipps, Feide or NIF integrations. AT Protocol OAuth
  and private OIDC linking with a synthetic provider are implemented.
- A separately deployed issuer service or production role/access-control system.
- Independent cryptographic repository verification or historical authorization
  receipts. The verifier trusts the fixed operator-controlled PDS transport and
  checks the issuer repository DID, subject, club, version, timestamps and CID.
- A relay indexer, public federation, attendee registration, event editing/deletion,
  or production-grade multi-instance concurrency/session storage.

The browser never receives PDS credentials. Anyone with the demo access code can
operate the synthetic issuer and seed example events. Personal publication
requires a separate AT Protocol OAuth login. The two PDS accounts are distinct, but this is a
facilitated demo, not real identity verification. Existing event display makes
no claim to prove historical authorization after a grant is removed.

## Architecture and records

```
Browser → loopback gateway → calendar backend → private PDS
                                  ├─ demo issuer account: permission records
                                  └─ organiser account: community event records
Independent CLI ───────────────────────────────→ private PDS
```

`src/pds.ts` is the transport adapter, `src/contracts.ts` the contract,
`src/verifier.ts` the reusable verifier, and `src/service.ts` the demo issuer
and publishing workflow. These are separate modules to make later service
extraction possible without starting with distributed-service overhead.

The [community event schema](https://github.com/lexicon-community/lexicon/blob/main/community/lexicon/calendar/event.json)
already provides name, description, start/end, attendance mode and location.
The demo adds `loftet: {version, demo, clubId, category, authority: {uri, cid}}`.
Other consumers may ignore it. An accepted authority has its own Lexicon in
`lexicons/no.demokratiloftet.demo.clubPublisher.json`. The namespace is provisional
under the project domain used by the VPS configuration. Before publishing outside
this sandbox, confirm domain control and publish/discuss the contract.

The PDS writes use `validate: false` because private schemas are not installed
on the PDS. Application validation is enforced for input and claim consumption.
This is not a claim of compatibility testing with Smoke Signal or other clients.
See [AT Protocol record keys](https://atproto.com/specs/record-key) for record
identity, and [Smoke Signal's schema migration](https://blog.smokesignal.events/posts/3lthgjbbhyk2c-community-lexicons)
for the community schema background.

## Local isolation

Calendar has only the existing internal sandbox network; runtime firewall allows only the PDS/PLC at `172.30.83.2:2582-2583`
and synthetic OIDC provider at `172.30.83.11:3002`. A fixed gateway may reach the calendar at `172.30.83.10:3000` and the local IdP at
`172.30.83.11:3002`, with host ingress bound to loopback on both ports. DNS and other IPv4/
IPv6 outbound connections are blocked. All app processes lose capabilities after
firewall installation. No host secrets or Docker socket are mounted. Source-only mounts allow development; a named volume stores private encrypted
auth data. No private host files are mounted. The existing PDS/PLC files are untouched.

Always run `npm run verify` after local infrastructure changes. If a new service
is exposed unexpectedly, stop it. This network isolation does not turn AT Protocol
records into private messages: any permitted client can still read the records.

## Deploy beside the VPS infrastructure

The app is deployed privately at https://calendar.dev.demokratiloftet.no,
through the existing Tailscale Traefik. Connect to the same tailnet as Bluesky.
There are no published calendar or identity-provider host ports.

Source and configuration on the VPS: `/root/calendar-app`. Deploy only this project:

```sh
cd /root/calendar-app
docker compose --env-file .env.vps -f compose.vps.yaml -f compose.tailnet.yaml up -d --build --wait
```

The existing PDS, PLC, Traefik and Bluesky services are managed separately.
Dedicated synthetic organiser and issuer accounts are used. Credentials are in
root-only `.secrets/demo-access.json` and `.env.vps`; the laptop copy is
`.secrets/vps-demo-access.json` (ignored by Git). Do not commit these files.
Use the organiser account for OAuth login and `demoAccessKey` in **Om demoen**
for synthetic grants and example activities.

`compose.tailnet.yaml` pins the reviewed PDS, PLC and synthetic OIDC hostnames
to the private proxy address using Docker `extra_hosts`. Set `PRIVATE_PROXY_IP`
if it changes. Startup validates these pins, restricts outbound connections,
blocks runtime DNS and drops capabilities. Restart calendar if the PDS IP changes.
OAuth state and private links persist in encrypted `auth-data`; preserve that
volume together with `AUTH_ENCRYPTION_KEY`. PDS records persist in the existing
PDS storage. Demo admin sessions reset on restart. The synthetic OIDC provider
uses in-memory sessions and rotates its signing key on restart; unfinished
identity flows must then be restarted.

See [deployment operations](DEPLOYMENT.md). The app firewall does not establish
that the rest of the VPS protocol stack is isolated.

## Account login and linking

Choose **Logg inn**, authenticate at the PDS, then open **Min konto**. Select
**Koble konto** beside **Demo-identitet**, choose a fictional identity, consent,
and confirm the link back in Loftet. **Fjern kobling** removes the private link.
The provider buttons for real services are deliberately not enabled.

See [the standalone identity component](../identity-component/README.md) for architecture, provider
configuration, security boundaries and the full test flow.

VPS auth additionally requires `AUTH_ENCRYPTION_KEY`, canonical HTTPS
`ATPROTO_PDS_ORIGIN` / `ATPROTO_PLC_URL`, and exact `AUTH_FETCH_ROUTES_JSON` origins
from `.env.vps.example`. Docker pins those origins to reviewed private/tailnet addresses; startup
validates the pins and runtime DNS remains blocked. No real external provider is
enabled in this deployment recipe. The private HTTPS deployment uses its canonical HTTPS callback URLs.

## Next milestone

Extract the demo issuer into its own service, then replace only the synthetic
authority adapter after NIF agrees to a test integration. The
calendar, PDS adapter and claim contract give that work a concrete consumer.


## Identity component dependency

Identity/auth source and its tests now live in the separate sibling repository
[`identity-component`](https://github.com/demokratiloftet/identity-component). This app consumes the
`@loftet/auth` and `@loftet/identity` 0.3.0 archives in `vendor/`. Normal `npm ci`
and Docker builds need only this calendar checkout; no sibling source mount or
unpublished registry package is required. The lockfile verifies archive integrity.
See [vendor provenance and update workflow](vendor/README.md). Rebuild the image
after updating the dependency; identity source is no longer live-mounted.

The calendar keeps its own composition, HTTP handlers, UI, fixture IdP and
business authorization. Component tests run in the component repository;
`npm test` here includes a check of the installed packages and calendar wiring.

## CI and demo deployment

Every pull request and default-branch push runs the checks in `.github/workflows/ci.yml`:
unit tests, dependency audit, build and a redacted full-history secret scan.
CI checks all application, browser, fixture, tooling and test TypeScript with
strict types and builds both Docker variants. Real-PDS integration and network
isolation use the sibling sandbox as documented above.

After checks pass on the default branch, the deploy job runs when the repository
variable `DEMO_DEPLOY_ENABLED` is `true`. It uses a dedicated SSH key restricted
to deploying this repository's current head. The VPS fetches source with the workflow’s short-lived
repository-scoped read token, builds before cutover, preserves volumes/secrets, restarts
only this app and restores its previous image if health checks fail. App-only
changes deploy automatically; topology, database schema and deploy-script changes
require an operator rollout. See the infrastructure repository's
[deployment runbook](https://github.com/demokratiloftet/server-infrastructure/blob/master/deploy/README.md).

Disable automatic deploy with `gh variable set DEMO_DEPLOY_ENABLED --body false
--repo demokratiloftet/calendar-app` (write the command on one line). Merging still runs CI.

## Public calendar variant

`APP_ENV=public-demo` now lives in this repository alongside the local/tailnet
variant. It serves no event records to anonymous visitors and disables the shared
admin session, seed, grant and revoke routes. With `DEMO_SELF_SERVICE=true`, a
signed-in fictional account can grant/revoke only its own demo club permission.
OAuth targets the operator's fixed PDS. `Dockerfile.public` builds this variant
for the existing isolated VPS network; it does not publish ports or provision PDS.
The infrastructure snapshot is retained for rollback and provenance.

## TypeScript build

`npm run typecheck` checks every maintained TypeScript file with strict and unused
code checks. `npm test` compiles and runs the tests against emitted code. The
server, local IdP and network tools compile with `tsc`; esbuild bundles browser
TypeScript into `/app.js`, preserving the existing gateway asset allowlist. No
TypeScript loader or compiler is installed in runtime images. Runtime schemas
validate PDS responses, activity records and incoming payloads; compile-time types
do not replace those checks. Both images use pinned Node 24.17.0.
