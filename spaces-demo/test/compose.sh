#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec docker compose -p "${SPACES_TEST_PROJECT:-loftet-spaces-check}" --env-file .runtime/test.env -f compose.yaml "$@"
