#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <vm_id> <tunnel_id> <country>" >&2
  exit 1
fi

VM_ID="$1"
TUNNEL_ID="$2"
COUNTRY="$3"

PROFILE="$(country_to_profile "$COUNTRY")"
SERVICE_NAME="$(service_for_country "$COUNTRY")"

if should_prepare_proxy_config "$PROFILE" "$SERVICE_NAME"; then
  # Single-service mode or forced config mode: swap config.ovpn before restart.
  prepare_proxy_config "$PROFILE"
fi

if [[ ! -f "$MICROVM_PROXY_HOME/docker-compose.yml" ]]; then
  echo "docker-compose.yml not found in $MICROVM_PROXY_HOME" >&2
  exit 1
fi

proxy_compose up -d --force-recreate "$SERVICE_NAME"

if ! wait_for_openvpn_tun "$SERVICE_NAME" 60; then
  echo "OpenVPN tunnel did not come up for service $SERVICE_NAME" >&2
  proxy_compose logs --no-color --tail 120 "$SERVICE_NAME" || true
  exit 1
fi

proxy_compose exec -T "$SERVICE_NAME" sh -lc "ip -4 addr show tun0 || true"
proxy_compose exec -T "$SERVICE_NAME" sh -lc "curl -4 -s https://ifconfig.me || true"
