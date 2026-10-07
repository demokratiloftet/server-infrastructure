# Identity package artifacts

These npm archives are built from the separate local `identity-component` repo,
commit `55b8114dba0baed3592e731bc54ee34e506448cc` (version 0.3.0).
The source was extracted from this calendar's commit `aff4ad0`.

- `loftet-auth-0.3.0.tgz`: AT OAuth, OIDC, encrypted store and sessions.
- `loftet-identity-0.3.0.tgz`: onboarding and provider-scoped handle policy.

They contain compiled ESM, type declarations and package documentation, not credentials, databases or
node_modules. `package-lock.json` pins their integrity. Normal installs and Docker
builds work from this repository alone. The source lives in the private `demokratiloftet/identity-component` GitHub repo;
packages are not published to npm. Changes belong in that source repository,
never in these archives by hand.

## Updating

1. Make and test changes in `../identity-component`. Bump package versions and
   the identity package's auth peer range when needed; commit the release there.
2. Run `npm run pack` in that repo and copy both new `.tgz` files into this folder.
3. Run `npm install --save-exact ./vendor/<auth-archive>.tgz ./vendor/<identity-archive>.tgz`
   here, update the provenance commit above, and remove superseded archives.
4. Run `npm test`, `npm run test:integration`, `npm run dev` and `npm run verify`.
   Commit the archives, manifest, lockfile and this provenance note together.

Package installation is explicit: changes in the sibling repo are not
automatically used by a running calendar container. Its persistent auth store
format is unchanged by the extraction; do not reset volumes to update packages.

TypeScript release source: `identity-component` commit `55b8114dba0baed3592e731bc54ee34e506448cc`.
Both archives export compiled ESM and checked `.d.ts` declarations.

- `loftet-auth-0.3.0.tgz` SHA-256: `e212b5f251ad08bc5ddf02cf876f6d08a30fa1b0bc955127b59a22e27c10933d`
- `loftet-identity-0.3.0.tgz` SHA-256: `6875fe8e001ab2b764590c13df9929fd6d430b87716743f49e64116b1b94f674`
