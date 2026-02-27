#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MICROVM_HOME="${MICROVM_HOME:-$HOME/microvm}"
MICROVM_PROXY_HOME="${MICROVM_PROXY_HOME:-$HOME/microvm-proxy}"
PROXY_SERVICE_NAME="${PROXY_SERVICE_NAME:-proxy-us}"
PROXY_SELECTION_MODE="${PROXY_SELECTION_MODE:-auto}"
COUNTRY_PROFILE_MAP="${COUNTRY_PROFILE_MAP:-}"
PROFILE_SERVICE_MAP="${PROFILE_SERVICE_MAP:-}"

STATE_ROOT="${MICROVM_STATE_ROOT:-$MICROVM_HOME/vms}"
SOCKETS_DIR="${MICROVM_SOCKETS_DIR:-$MICROVM_HOME/sockets}"
LOGS_DIR="${MICROVM_LOGS_DIR:-$MICROVM_HOME/logs}"

ensure_dir() {
  mkdir -p "$1"
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g'
}

resolve_path() {
  local value="$1"
  if [[ "$value" = /* ]]; then
    echo "$value"
  else
    echo "$MICROVM_HOME/$value"
  fi
}

resolve_kernel() {
  local supplied="$1"
  local candidate
  candidate="$(resolve_path "$supplied")"
  if [[ -f "$candidate" ]]; then
    echo "$candidate"
    return
  fi
  if [[ -f "$MICROVM_HOME/kernel/vmlinux" ]]; then
    echo "$MICROVM_HOME/kernel/vmlinux"
    return
  fi
  echo "$candidate"
}

resolve_rootfs() {
  local supplied="$1"
  local candidate
  candidate="$(resolve_path "$supplied")"
  if [[ -f "$candidate" ]]; then
    echo "$candidate"
    return
  fi
  if [[ -f "$MICROVM_HOME/rootfs/rootfs.ext4" ]]; then
    echo "$MICROVM_HOME/rootfs/rootfs.ext4"
    return
  fi
  echo "$candidate"
}

find_bin() {
  local binary="$1"
  if command -v "$binary" >/dev/null 2>&1; then
    command -v "$binary"
    return
  fi

  local candidate=""
  for candidate in \
    "$MICROVM_HOME/bin/$binary" \
    "$MICROVM_HOME/release-v1.6.0-x86_64/$binary"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done

  echo ""
}

require_bin() {
  local binary="$1"
  local path
  path="$(find_bin "$binary")"
  if [[ -z "$path" ]]; then
    echo "Missing required binary '$binary' (PATH or $MICROVM_HOME/bin)." >&2
    exit 1
  fi
  echo "$path"
}

vm_state_dir() {
  local vm_id="$1"
  echo "$STATE_ROOT/$vm_id"
}

pid_file_for() {
  local vm_id="$1"
  echo "$(vm_state_dir "$vm_id")/firecracker.pid"
}

socket_file_for() {
  local vm_id="$1"
  echo "$SOCKETS_DIR/$vm_id.socket"
}

proxy_compose() {
  docker compose -f "$MICROVM_PROXY_HOME/docker-compose.yml" "$@"
}

compose_service_exists() {
  local service_name="$1"
  proxy_compose config --services 2>/dev/null | grep -Fxq "$service_name"
}

compose_services_for_profile() {
  local profile="$1"
  proxy_compose config --services 2>/dev/null | grep -E "^proxy-${profile}-" || true
}

map_lookup() {
  local mapping="$1"
  local key="$2"
  local pair=""
  local k=""
  local v=""
  IFS=',' read -ra pairs <<< "$mapping"
  for pair in "${pairs[@]}"; do
    k="${pair%%=*}"
    v="${pair#*=}"
    if [[ "$k" == "$key" && -n "$v" ]]; then
      echo "$v"
      return 0
    fi
  done
  return 1
}

country_to_profile() {
  local country_lower
  country_lower="$(echo "$1" | tr '[:upper:]' '[:lower:]' | tr '_' '-' )"

  local mapped_profile=""
  if mapped_profile="$(map_lookup "$COUNTRY_PROFILE_MAP" "$country_lower" 2>/dev/null)"; then
    echo "$mapped_profile"
    return
  fi

  case "$country_lower" in
    us|usa|united-states|united_states) echo "us" ;;
    es|spain) echo "es" ;;
    de|germany) echo "de" ;;
    fr|france) echo "fr" ;;
    uk|gb|united-kingdom|great-britain) echo "uk" ;;
    ca|canada) echo "ca" ;;
    jp|japan) echo "jp" ;;
    sg|singapore) echo "sg" ;;
    au|australia) echo "au" ;;
    *)
      if [[ -f "$MICROVM_PROXY_HOME/configs/$country_lower.ovpn" ]]; then
        echo "$country_lower"
      else
        echo "$country_lower"
      fi
      ;;
  esac
}

prepare_proxy_config() {
  local profile="$1"
  local src=""
  local configs_dir="$MICROVM_PROXY_HOME/configs"
  local direct_candidate="$configs_dir/$profile.ovpn"
  if [[ -f "$direct_candidate" ]]; then
    src="$direct_candidate"
  else
    local matches=()
    shopt -s nullglob
    matches=("$configs_dir/$profile"-*.ovpn)
    shopt -u nullglob
    if [[ "${#matches[@]}" -gt 0 ]]; then
      src="${matches[$((RANDOM % ${#matches[@]}))]}"
    fi
  fi
  local dst="$MICROVM_PROXY_HOME/config.ovpn"
  if [[ -z "$src" || ! -f "$src" ]]; then
    echo "OpenVPN config not found for profile '$profile' under $configs_dir (expected $profile.ovpn or $profile-*.ovpn)." >&2
    exit 1
  fi
  cp "$src" "$dst"
  echo "Using OpenVPN config $(basename "$src") for profile '$profile'." >&2
}

print_public_ip() {
  local ip=""
  ip="$(curl -4 -s https://ifconfig.me 2>/dev/null || true)"
  if [[ -n "$ip" ]]; then
    echo "$ip"
  fi
}

service_for_country() {
  local country="$1"
  local profile
  profile="$(country_to_profile "$country")"
  local selected=""

  if [[ "$PROXY_SELECTION_MODE" == "config" ]]; then
    echo "$PROXY_SERVICE_NAME"
    return
  fi

  if selected="$(map_lookup "$PROFILE_SERVICE_MAP" "$profile" 2>/dev/null)"; then
    if compose_service_exists "$selected"; then
      echo "$selected"
      return
    fi
  fi

  local candidate="proxy-$profile"
  if compose_service_exists "$candidate"; then
    echo "$candidate"
    return
  fi

  local suffixed=()
  local service_name=""
  while IFS= read -r service_name; do
    if [[ -n "$service_name" ]]; then
      suffixed+=("$service_name")
    fi
  done < <(compose_services_for_profile "$profile")
  if [[ "${#suffixed[@]}" -gt 0 ]]; then
    echo "${suffixed[$((RANDOM % ${#suffixed[@]}))]}"
    return
  fi

  if [[ "$PROXY_SELECTION_MODE" == "service" || "$PROXY_SELECTION_MODE" == "auto" ]]; then
    echo "No compose service found for profile '$profile'. Add PROFILE_SERVICE_MAP, define proxy-$profile or proxy-$profile-*, or use PROXY_SELECTION_MODE=config." >&2
    exit 1
  fi

  echo "$PROXY_SERVICE_NAME"
}

should_prepare_proxy_config() {
  local profile="$1"
  local service_name="$2"

  if [[ "$PROXY_SELECTION_MODE" == "config" ]]; then
    return 0
  fi
  if [[ "$PROXY_SELECTION_MODE" == "service" ]]; then
    return 1
  fi

  if [[ "$service_name" == "proxy-$profile" ]]; then
    return 1
  fi
  return 0
}

wait_for_openvpn_tun() {
  local service_name="${1:-$PROXY_SERVICE_NAME}"
  local timeout="${2:-60}"
  local i=0
  while [[ "$i" -lt "$timeout" ]]; do
    if proxy_compose exec -T "$service_name" sh -lc "ip link show tun0 >/dev/null 2>&1"; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}
