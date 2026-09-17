#!/bin/sh
# Replaces upstream relay/post-setup.sh, which hardcodes the admin password.
# Deliberately no `set -x`: it would print the password into the container log.
set -eu

echo "Requesting relay to crawl PDS..."
curl --fail-with-body --silent --show-error \
  -u "admin:${RELAY_ADMIN_PASSWORD}" \
  -X POST "https://${RELAY_HOST}/admin/pds/requestCrawl" \
  -H "Content-Type: application/json" \
  -d "{\"hostname\": \"${PDS_HOST}\"}"

echo "Relay crawl request completed successfully"
touch /tmp/ready

echo "Sleeping to support docker compose up -d --wait"
sleep infinity
