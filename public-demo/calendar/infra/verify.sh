#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose exec -T --user node calendar node dist/infra/isolation-test.js
docker compose exec -T --user node gateway node dist/infra/isolation-test.js gateway
docker compose exec -T --user node demo-idp node dist/infra/isolation-test.js idp
docker inspect "$(docker compose ps -q calendar)" "$(docker compose ps -q gateway)" "$(docker compose ps -q demo-idp)" | node dist/infra/topology-test.js
(cd "${SANDBOX_DIR:-../local-sandbox}" && ./verify.sh)
