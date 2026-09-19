#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
python3 public-demo/register-relay.py --staging
# The test client needs host loopback, not Docker socket or production credentials.
exec docker run --rm --network host --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user node \
  -v "$PWD/public-demo/test:/test:ro" \
  node:22-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2 \
  node /test/smoke.mjs
