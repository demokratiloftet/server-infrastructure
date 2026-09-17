#!/bin/sh
set -e

echo "Starting DNS update script..."

require_env() {
  local var_name="$1"
  eval local var_value=\$$var_name
  if [ -z "$var_value" ]; then
    echo "ERROR: ${var_name} not set"
    exit 1
  fi
}

validate_env() {
  require_env "VERCEL_API_TOKEN"
  require_env "VERCEL_TEAM_ID"
  require_env "DOMAIN"
  require_env "PARTITION"
  echo "Environment variables validated"
}

wait_for_tailscale() {
  sleep 3
  mkdir -p /var/run/tailscale
  ln -sf /tmp/tailscaled.sock /var/run/tailscale/tailscaled.sock
}

get_tailscale_ip() {
  local ip=$(tailscale ip -4)
  [ -z "$ip" ] && echo "Failed to get Tailscale IP" && exit 1
  echo "$ip"
}

get_record_id() {
  local record_name="$1"
  curl --fail-with-body --silent --show-error --max-time 30 \
    "https://api.vercel.com/v5/domains/${DOMAIN}/records?teamId=${VERCEL_TEAM_ID}&limit=100" \
    -H "Authorization: Bearer ${VERCEL_API_TOKEN}" \
    -H "Content-Type: application/json" |
    jq -r --arg name "$record_name" '.records[] | select(.type == "A" and .name == $name) | .id' |
    head -1
}

create_dns_record() {
  local name="$1"
  local ip="$2"
  echo "Creating DNS record ${name} -> ${ip}"
  jq -n --arg name "$name" --arg value "$ip" \
    '{type: "A", name: $name, value: $value, ttl: 60, comment: "Private ATProto development network"}' |
    curl --fail-with-body --silent --show-error --max-time 30 -X POST \
      "https://api.vercel.com/v2/domains/${DOMAIN}/records?teamId=${VERCEL_TEAM_ID}" \
      -H "Authorization: Bearer ${VERCEL_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data-binary @- >/dev/null
  echo "DNS record created successfully"
}

update_dns_record() {
  local record_id="$1"
  local name="$2"
  local ip="$3"
  echo "Updating DNS record ${name} -> ${ip}"
  jq -n --arg name "$name" --arg value "$ip" \
    '{type: "A", name: $name, value: $value, ttl: 60, comment: "Private ATProto development network"}' |
    curl --fail-with-body --silent --show-error --max-time 30 -X PATCH \
      "https://api.vercel.com/v1/domains/records/${record_id}?teamId=${VERCEL_TEAM_ID}" \
      -H "Authorization: Bearer ${VERCEL_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data-binary @- >/dev/null
  echo "DNS record updated successfully"
}

upsert_dns_record() {
  local name="$1"
  local ip="$2"
  local record_id
  record_id=$(get_record_id "$name")

  if [ -z "$record_id" ]; then
    create_dns_record "$name" "$ip"
  else
    update_dns_record "$record_id" "$name" "$ip"
  fi
}

check_dns_resolver() {
  local domain="$1"
  local expected_ip="$2"
  local dns_server="$3"
  local resolver_name="$4"
  local max_attempts=60
  local attempt=1

  echo "Checking ${resolver_name} for ${domain}..."

  while [ $attempt -le $max_attempts ]; do
    local resolved_ip
    if [ -n "$dns_server" ]; then
      resolved_ip=$(nslookup "$domain" "$dns_server" 2>/dev/null | grep -A1 "Name:" | grep "Address:" | awk '{print $2}' | head -1 || true)
    else
      resolved_ip=$(nslookup "$domain" 2>/dev/null | grep -A1 "Name:" | grep "Address:" | awk '{print $2}' | head -1 || true)
    fi

    if [ "$resolved_ip" = "$expected_ip" ]; then
      echo "✅ ${resolver_name} resolved successfully: ${domain} -> ${expected_ip}"
      return 0
    fi

    if [ -z "$resolved_ip" ]; then
      echo "Attempt ${attempt}/${max_attempts}: ${domain} not found (NXDOMAIN)..."
    else
      echo "Attempt ${attempt}/${max_attempts}: ${domain} resolves to '${resolved_ip}', waiting for '${expected_ip}'..."
    fi
    sleep 2
    attempt=$((attempt + 1))
  done

  if [ -z "$resolved_ip" ]; then
    echo "❌ Error: ${resolver_name} cannot find ${domain} after ${max_attempts} attempts (NXDOMAIN)"
  else
    echo "❌ Error: ${resolver_name} still resolves ${domain} to '${resolved_ip}' instead of '${expected_ip}'"
  fi
  return 1
}

wait_for_dns_propagation() {
  local domain="$1"
  local expected_ip="$2"

  echo "Waiting for DNS propagation of ${domain}..."

  # First, verify the record exists in public DNS.
  if ! check_dns_resolver "$domain" "$expected_ip" "1.1.1.1" "Public DNS (1.1.1.1)"; then
    echo "❌ DNS record is not available from the public resolver"
    echo "This indicates the Vercel record has not propagated globally"
    return 1
  fi

  # Then, verify the record is accessible via host DNS (used by Docker containers)
  if ! check_dns_resolver "$domain" "$expected_ip" "" "Host DNS resolver"; then
    echo "❌ DNS record has not propagated to the host DNS resolver"
    echo "This indicates a local DNS caching issue (e.g., Tailscale MagicDNS cache)"
    echo "The record exists in Cloudflare but may take additional time to reach local caches"
    return 1
  fi

  echo "✅ DNS propagation complete - record accessible both globally and locally"
  return 0
}

main() {
  validate_env
  wait_for_tailscale

  local ip=$(get_tailscale_ip)

  local full_domain="${PARTITION}.${DOMAIN}"
  echo "Updating DNS for ${full_domain} to ${ip}"

  # Explicit records first: an ACME challenge on _acme-challenge.<host> turns
  # <host> into an empty non-terminal, which stops the wildcard from covering it.
  for host in traefik plc pds relay jetstream bsky ozone feedgen social; do
    upsert_dns_record "${host}.${PARTITION}" "$ip"
  done

  upsert_dns_record "*.${PARTITION}" "$ip"
  upsert_dns_record "*.pds.${PARTITION}" "$ip"

  wait_for_dns_propagation "traefik.${full_domain}" "$ip"

  echo "✅ DNS update complete"
}

main
