#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec docker compose -p loftet-spaces-check --env-file .runtime/test.env -f compose.yaml "$@"
