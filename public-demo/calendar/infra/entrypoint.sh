#!/bin/sh
set -eu
for fw in iptables ip6tables; do
  "$fw" -P OUTPUT DROP
  "$fw" -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  "$fw" -A OUTPUT -p udp --dport 53 -j REJECT
  "$fw" -A OUTPUT -p tcp --dport 53 -j REJECT
  "$fw" -A OUTPUT -o lo -p tcp -m multiport --dports 3000,3002 -j ACCEPT
done
iptables -I OUTPUT 1 -d 127.0.0.11 -j REJECT
case "${1:-}" in
  gateway)
    iptables -A OUTPUT -d 172.30.83.10 -p tcp --dport 3000 -j ACCEPT
    iptables -A OUTPUT -d 172.30.83.11 -p tcp --dport 3002 -j ACCEPT
    program=/app/dist/infra/gateway.js ;;
  idp)
    program=/app/dist/src/demo-idp.js ;;
  *)
    iptables -A OUTPUT -d 172.30.83.2 -p tcp -m multiport --dports 2582,2583 -j ACCEPT
    iptables -A OUTPUT -d 172.30.83.11 -p tcp --dport 3002 -j ACCEPT
    program=/app/dist/src/server.js ;;
esac
exec setpriv --reuid=node --regid=node --init-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all node "$program"
