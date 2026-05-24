#!/usr/bin/env bash
# Sprint B B.3.h — DNS handover: firefly-mesh.com → Vercel
#
# Usage:
#   CF_TOKEN=<token> bash tools/dns-handover.sh
#
# What it does:
#   1. List current DNS records for the apex + www
#   2. Delete the CF Worker A records (172.67.x.x / 104.21.x.x)
#   3. Create 2 Vercel A records for apex (216.198.79.1, 64.29.17.1)
#      with proxied=false (orange-cloud OFF — Vercel needs direct request)
#   4. Replace www A/CNAME with CNAME → cname.vercel-dns.com (proxied=false)
#   5. Poll until firefly-mesh.com resolves to Vercel + returns 200
#
# Required token scope: Zone:DNS:Edit on firefly-mesh.com
# After it passes, delete this script (one-shot) and docs/ops/DNS_VERCEL_HANDOVER.md.

set -euo pipefail

if [ -z "${CF_TOKEN:-}" ]; then
  echo "ERROR: CF_TOKEN env var required (Cloudflare API token with Zone:DNS:Edit)"
  exit 2
fi

ZONE_ID="dc2aac51143f38687db424bba97dbfe3"
DOMAIN="firefly-mesh.com"
WWW="www.firefly-mesh.com"

# Vercel anycast (rank-1 from /v6/domains/.../config)
VERCEL_IP_1="216.198.79.1"
VERCEL_IP_2="64.29.17.1"
VERCEL_CNAME="cname.vercel-dns.com"

cf() {
  curl -fsS \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    "$@"
}

list_records() {
  cf "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$1" \
    | sed 's/{"id"/\n{"id"/g' | grep -oE '"id":"[a-f0-9]{32}".*?"name":"[^"]+","content":"[^"]+","proxied":(true|false)' | head -5
}

delete_record() {
  echo "  delete $1"
  cf -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$1" >/dev/null
}

create_a() {
  local name=$1 ip=$2
  echo "  create A $name -> $ip (proxied=false)"
  cf -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
    -d "{\"type\":\"A\",\"name\":\"$name\",\"content\":\"$ip\",\"ttl\":1,\"proxied\":false}" >/dev/null
}

create_cname() {
  local name=$1 target=$2
  echo "  create CNAME $name -> $target (proxied=false)"
  cf -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
    -d "{\"type\":\"CNAME\",\"name\":\"$name\",\"content\":\"$target\",\"ttl\":1,\"proxied\":false}" >/dev/null
}

verify_token() {
  echo "==> Verifying CF token..."
  cf "https://api.cloudflare.com/client/v4/user/tokens/verify" | head -c 200
  echo ""
}

dump_current() {
  echo ""
  echo "==> Current $1 records:"
  list_records "$1" | sed 's/^/  /' || echo "  (none)"
}

reset_record() {
  local name=$1 type=$2  # type unused but kept for clarity
  echo ""
  echo "==> Removing all existing A/CNAME for $name..."
  local ids
  ids=$(cf "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$name" \
        | grep -oE '"id":"[a-f0-9]{32}"' | sed 's/"id":"//;s/"$//' || true)
  for id in $ids; do
    # Skip TXT etc. — only kill A/CNAME for the target name
    local kind
    kind=$(cf "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$id" \
           | grep -oE '"type":"[A-Z]+"' | sed 's/"type":"//;s/"$//')
    if [ "$kind" = "A" ] || [ "$kind" = "CNAME" ] || [ "$kind" = "AAAA" ]; then
      delete_record "$id"
    fi
  done
}

verify_token
dump_current "$DOMAIN"
dump_current "$WWW"

reset_record "$DOMAIN" A
reset_record "$WWW" CNAME

echo ""
echo "==> Creating Vercel records..."
create_a "$DOMAIN" "$VERCEL_IP_1"
create_a "$DOMAIN" "$VERCEL_IP_2"
create_cname "$WWW" "$VERCEL_CNAME"

echo ""
echo "==> New state:"
dump_current "$DOMAIN"
dump_current "$WWW"

echo ""
echo "==> Polling until firefly-mesh.com resolves to Vercel..."
for i in $(seq 1 30); do
  IP=$(dig +short @1.1.1.1 firefly-mesh.com A | head -1 || true)
  if [ "$IP" = "$VERCEL_IP_1" ] || [ "$IP" = "$VERCEL_IP_2" ]; then
    echo "  [$i] resolved: $IP ✓"
    break
  fi
  echo "  [$i] still resolves to $IP — waiting 5s..."
  sleep 5
done

echo ""
echo "==> Smoke testing https://firefly-mesh.com/..."
sleep 2  # tiny grace for cert
for p in / /login /signup /api/health; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 20 "https://firefly-mesh.com$p" || echo "000")
  echo "  $CODE  https://firefly-mesh.com$p"
done

echo ""
echo "Done. Now run: pnpm test:e2e:web with FIREFLY_BASE_URL=https://firefly-mesh.com"
