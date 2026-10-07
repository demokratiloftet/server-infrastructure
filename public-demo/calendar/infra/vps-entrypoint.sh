#!/bin/sh
set -eu
# Resolve exactly the configured Docker PDS service before credentials are used.
# Runtime DNS and all other egress are then disabled.
PDS_ADDRESS=$(node /app/dist/infra/pds-address.js)
PDS_PORT=${PDS_DOCKER_PORT:-3000}
case "$PDS_PORT" in ''|*[!0-9]*) echo 'Invalid PDS port' >&2; exit 1;; esac
node /app/dist/infra/auth-egress-plan.js > /tmp/auth-egress.plan
for fw in iptables ip6tables; do
  "$fw" -P OUTPUT DROP
  "$fw" -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  "$fw" -A OUTPUT -p udp --dport 53 -j REJECT
  "$fw" -A OUTPUT -p tcp --dport 53 -j REJECT
  "$fw" -A OUTPUT -o lo -p tcp --dport 3000 -j ACCEPT
done
iptables -I OUTPUT 1 -d 127.0.0.11 -j REJECT
iptables -A OUTPUT -d "$PDS_ADDRESS" -p tcp --dport "$PDS_PORT" -j ACCEPT
while read -r address port; do
  iptables -A OUTPUT -d "$address" -p tcp --dport "$port" -j ACCEPT
done < /tmp/auth-egress.plan
export PDS_URL="http://$PDS_ADDRESS:$PDS_PORT"
exec setpriv --reuid=node --regid=node --init-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all node /app/dist/src/server.js
