#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = --staging ]; then
  shift
  exec docker compose -p loftet-public-demo-check --env-file public-demo/test/.runtime/base.env --env-file public-demo/test/.runtime/demo.env --env-file spaces-demo/.env.staging -f compose.yaml -f compose.override.yaml -f compose.public.yaml -f public-demo/test/compose.yaml -f compose.spaces.yaml "$@"
fi
exec docker compose --env-file .env --env-file public-demo/.env --env-file spaces-demo/.env -f compose.yaml -f compose.override.yaml -f compose.public.yaml -f compose.spaces.yaml "$@"
