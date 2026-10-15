# Demokratiløftet infrastructure and demos

Private deployment source for the Demokratiløftet demos: Eurosky/AT Protocol,
private PLC/PDS, the public gateway, and experimental Spaces support. Upstream
[Eurosky](https://github.com/eurosky-social/u-at-proto) is pinned as the `upstream/`
Git submodule; container images are pinned by digest. DNS/TLS uses Vercel DNS.

## Repositories

All implementation repositories are private. Clone using an account with access
to the `demokratiloftet` organisation.

| Repository                                                                        | Purpose                                                           | Local start                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| [loftet-social](https://github.com/demokratiloftet/loftet-social)                 | Open/closed groups, events, native Spaces access checks           | `pnpm install --frozen-lockfile`, `pnpm demo:setup`, `pnpm demo:up` |
| [calendar-app](https://github.com/demokratiloftet/calendar-app)                   | Calendar, OAuth and synthetic club permissions                    | Start `local-sandbox`, then `npm ci`, `npm run dev`                 |
| [identity-component](https://github.com/demokratiloftet/identity-component)       | Reusable server-side AT OAuth/OIDC/linking packages               | `npm ci`, `npm test`, `npm run test:package`                        |
| [attestation-issuer](https://github.com/demokratiloftet/attestation-issuer)       | Signed claims, scoped policy, revocation and independent verifier | `npm run dev`                                                       |
| [local-sandbox](https://github.com/demokratiloftet/local-sandbox)                 | Disposable loopback-only PDS/PLC for development                  | `npm run up`, `npm run verify`                                      |
| [organisation-verifier](https://github.com/demokratiloftet/organisation-verifier) | Brreg/AT Protocol verification, isolated publication fixture      | See its README                                                      |
| This repository                                                                   | Persistent VPS topology, gateway and experimental PDS patches     | Use the matching overlay guide below                                |

## Clone and check without production credentials

Requires Git, Node 24.17 (the pinned Node 24 LTS line), Python 3 and Docker Compose supporting `!override` and
`!reset`. These commands create disposable local test configuration only:

```sh
gh repo clone demokratiloftet/server-infrastructure
cd server-infrastructure
git submodule update --init --recursive
npm ci --ignore-scripts
npm run typecheck
npm test
npm audit --audit-level=moderate
npm ci --ignore-scripts --prefix public-demo/calendar
npm test --prefix public-demo/calendar
python3 public-demo/test/configure.py
python3 public-demo/preflight.py --staging
```

For a full disposable stack follow [public-demo/README.md](public-demo/README.md).
For the smallest local social app use its own self-contained repository above.
The base infrastructure needs operator-owned DNS, TLS, service identities and
secrets; copying `.env.example` is not enough to safely start a shared server.
Never print resolved Compose configuration, since it includes credentials.

## Which deployment owns what

- [Public demo](public-demo/README.md): original Bluesky client, public calendar,
  private PDS/PLC/federation, exact-route HTTPS gateway. No public AT federation.
- [Spaces noticeboard](spaces-demo/README.md): optional standalone alpha example.
- [Løftet overlay](https://github.com/demokratiloftet/loftet-social/blob/main/deploy/README.md):
  the currently deployed social app and its separate Spaces PDS/database, plus
  OAuth ingress and approved domain handles. Use its `deploy/compose.sh` wrapper
  for the live shared stack. A base-only gateway update restores old routing.

The standalone noticeboard and Løftet overlay both reserve `.21` for a Spaces
PDS. They are **alternative overlays**, not two apps to enable together against
the same stack. The social app owns separate volumes; never repoint an alpha PDS
at the original PDS's data.

`master` consolidates the previously local `feat/public-demo-private-federation`
and `feat/spaces-private-demo` branches. Both branches are retained for provenance.
Publishing this source does not itself switch the VPS infrastructure branch.
Calendar supports public-demo mode in its own repository. The vendored TypeScript
snapshot matches its reviewed release; see [provenance](public-demo/calendar/PROVENANCE.md).
Older snapshots remain in Git history.

## Code standards

Maintained application, gateway, DNS, browser, patch and test code is TypeScript.
`tsconfig.json` enables strict checking, unused-symbol checks and `noEmitOnError`.
Compile with `npm run build`; containers execute emitted JavaScript from `dist/`.
Python and shell remain native operator tools. Upstream code is pinned separately.
Validate untrusted HTTP and PDS responses at runtime; types alone are not validation.
Use `npm run format` before committing, and keep secrets and generated output ignored.

CI builds from a fresh clone, checks types/formatting/dependencies/secrets, tests
boundaries, and exercises a real isolated Spaces PDS with three synthetic accounts.
The vendored calendar is checked as its own package. For complete Bluesky/AppView
acceptance, follow the public-demo guide; that larger upstream build is an operator
check. Shared PDS and network changes always need isolated acceptance and backups.

## Operations and safety

See [automatic app deployment and rollback](deploy/README.md),
[security policy](SECURITY.md), and [review evidence](docs/REVIEW-2026-10-07.md).
Application CI tests every PR and main/master push. Infrastructure CI validates
both gateway boundaries and private topology. Shared networking, PDS images,
volumes and database migrations are deliberately operated separately from app
redeploys, with a coordinated backup and explicit migration review.

These are synthetic-data demos. Spaces is experimental authorization, not
end-to-end encryption. Authentication/handle ownership is not proof of real
organisation membership. No review can certify all future code or dependencies
as safe; tests and audits must remain part of each change.

## License

Licensed under [MIT](LICENSE).
