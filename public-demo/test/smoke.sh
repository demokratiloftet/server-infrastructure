#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
python3 public-demo/register-relay.py --staging
# The test client needs host loopback, not Docker socket or production credentials.
exec docker run --rm --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user node \
  -v "$PWD:/source:ro" \
  node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 \
  node /source/dist/public-demo/test/smoke.js
