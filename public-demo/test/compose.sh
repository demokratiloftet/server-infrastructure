#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
exec docker compose -p loftet-public-demo-check --env-file public-demo/test/.runtime/base.env --env-file public-demo/test/.runtime/demo.env -f compose.yaml -f compose.override.yaml -f compose.public.yaml -f public-demo/test/compose.yaml "$@"
