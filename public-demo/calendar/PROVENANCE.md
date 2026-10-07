# Calendar snapshot provenance

Source: [demokratiloftet/calendar-app](https://github.com/demokratiloftet/calendar-app),
commit `a28e819f6c31b8f1f8e3a1f1dddf993a31e6be41` (2026-10-07).
This directory is the tracked source archive of that commit, including the pinned
`@loftet/auth` and `@loftet/identity` 0.3.0 packages. No local secrets, data or build
outputs are included. Update from a reviewed canonical commit, then rerun its tests.

Build with Node 24.17: `npm ci --ignore-scripts && npm test` in this directory.
The public infrastructure uses this directory as the `Dockerfile.public` build
context. The running VPS app is independently released from `calendar-app` by its
CI workflow. Prior calendar snapshots remain available in infrastructure Git history.

One infrastructure-specific adaptation allows `SANDBOX_DIR=/absolute/path/to/local-sandbox`
for `npm run verify`; the default remains the canonical sibling checkout. No
application code differs from the source commit.
