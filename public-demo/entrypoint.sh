#!/bin/sh
set -eu
# This is the only content-facing container with an external network. Permit
# replies and the exact private stack; prohibit new external IPv4/IPv6 traffic.
case "${DEMO_PRIVATE_SUBNET:-}" in 172.*.0/24|10.*.0/24|192.168.*.0/24) ;; *) echo 'Set reviewed private /24 subnet' >&2; exit 1;; esac
for fw in iptables ip6tables; do
  "$fw" -P OUTPUT DROP
  "$fw" -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  "$fw" -A OUTPUT -o lo -j ACCEPT
done
iptables -A OUTPUT -d "$DEMO_PRIVATE_SUBNET" -p tcp -m multiport --dports 3000,2584,53 -j ACCEPT
iptables -A OUTPUT -d "$DEMO_DNS_IP" -p udp --dport 53 -j ACCEPT
# Docker embedded DNS forwards only to the authoritative private resolver.
exec setpriv --reuid=node --regid=node --init-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs node /demo/dist/gateway.js
