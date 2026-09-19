#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec docker compose --env-file .env --env-file public-demo/.env -f compose.yaml -f compose.override.yaml -f compose.public.yaml "$@"
