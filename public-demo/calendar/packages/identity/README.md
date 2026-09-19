# Identity gateway — first working local version

`IdentityGateway` extends the existing auth service. It replaces the earlier,
unconnected enrollment prototype; there is one browser onboarding flow.

## Try it locally

Start the existing sandbox and calendar as described in the root README. Open
http://127.0.0.1:3000 and choose **Start demoen → Velg eller lag en testperson**.
Enter a fictional name to create a fresh identity, or choose an existing person.
New test people persist in the local `demo-people` Docker volume. Each creation
gets a distinct subject, even when names match; names never link accounts.

- New account: **Opprett demokonto for meg** generates a sandbox handle. Continue
  to the PDS with the displayed fixture password, authorize, then explicitly
  confirm the association. The password is deliberately public demo data
  (`local-sandbox-only`), suitable only for the isolated synthetic sandbox.
- Existing account: expand the existing-account option, enter its handle,
  authenticate at the private PDS, authorize, then confirm the association.
- Return: use the same fictional OIDC identity. A valid stored AT authorization is
  reused. Missing/revoked authorization requires confirmation at the PDS again.
- Logout clears local access and revokes the shared AT authorization. Removing an
  identity link removes permission for future OIDC sign-ins through that link;
  it does not delete the PDS account or sign out existing AT-authenticated sessions.

A newly provisioned account has no club publishing authority. Choose a club in step 2
and **Simuler klubbens godkjenning**. This local-only shortcut grants permission
to the authenticated account, never a browser-supplied subject. Step 3 opens the
activity form with an optional example. See [demo walkthrough](../../docs/DEMO.md).

## Boundaries

- Only providers explicitly listed in `IDENTITY_LOGIN_PROVIDERS_JSON` can be used
  as entry points. The shared default is `[]`; local development enables `demo`.
  Register provider definitions in `OIDC_PROVIDERS_JSON` as before. The reusable
  provider keeps issuer/audience/signature/nonce/expiry/freshness validation.
- Old identity links are NOT automatically login grants. The `identity_logins`
  table records explicit consent separately. One entry identity per DID and one
  DID per entry identity. Matching uses keyed hashes of verified issuer + subject,
  never email or name. Linking and granting login permission share a transaction.
- HttpOnly SameSite cookies bind both protocols to the browser. Callback states
  are consumed once; successful steps rotate the cookie. Same-origin JSON is
  required for mutations. Pending AT authorization cannot publish or access a
  signed-in calendar until explicit confirmation.
- Auth state and identity data remain encrypted in the existing AuthStore. No new
  database service, identity server or credentials store is introduced.
- A durable signup marker prevents concurrent/repeated creation. Ambiguous errors
  require operator review; the marker retains the requested handle, not password
  or raw provider errors. An already-created account can resume authorization.
  Cancelling the browser flow does not roll back remote account creation.
- One process and one auth store only. No multi-replica coordination, recovery UI,
  automatic merge, invite management or production account lifecycle is included.
- Provisioning is local-only. Its fixed loopback PDS target is rewritten through
  the existing exact-origin transport when running inside the isolated container.
  The VPS has no provisioning adapter. Arbitrary external PDSs remain unreachable.

## Before a real organisation pilot

Configure a registered OIDC client, decide admission policy, and add reviewed
network access. Implement a provisioning adapter for the selected PDS and an
organisation-owned domain, including helpful name-availability feedback and
recovery for rejected/uncertain creation. The sandbox currently reports creation
failures conservatively for operator review. Verify credential/recovery policy
with that PDS before replacing the explicit password + AT OAuth steps.

Matrix is out of scope for the agreed first version. Nothing in this increment
is deployed to the VPS. The synthetic identity provider is not a real login system.

## Verification

```sh
npm test
node test/identity-integration.mjs
npm run test:integration
npm run verify
```

Gateway tests cover missing confirmation, wrong/replayed callbacks, logout during
exchange, existing links versus login grants, incorrect DIDs, identity conflicts,
creation races and review markers. Token validation tests exercise signed OIDC
responses. Browser tests cover both account choices using the real local IdP/PDS.

Verified in the local browser: existing-account linking, new-account creation,
explicit confirmation, session persistence after calendar restart, and OIDC-only
return with retained AT authorization. HTTP checks reject cross-origin mutations
and unauthenticated creation, confirmation and event publication.
