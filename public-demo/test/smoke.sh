#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
python3 public-demo/register-relay.py --staging
# The test client needs host loopback, not Docker socket or production credentials.
exec docker run --rm --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user node \
  -v "$PWD:/source:ro" \
  node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 \
  node /source/dist/public-demo/test/smoke.js
