#!/bin/sh
# Vendored public-demo variant: verify the explicitly separate staging stack.
set -eu
cd "$(dirname "$0")/../.."
python3 verify.py --staging
