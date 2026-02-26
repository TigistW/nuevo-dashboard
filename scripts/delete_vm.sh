#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <vm_id> <tap_dev> <namespace>" >&2
  exit 1
fi

VM_ID="$1"
TAP_DEV="$2"
NAMESPACE="$3"
VM_STATE_DIR="$(vm_state_dir "$VM_ID")"

"$SCRIPT_DIR/stop_vm.sh" "$VM_ID" || true

ip link delete "$TAP_DEV" 2>/dev/null || true
ip netns delete "$NAMESPACE" 2>/dev/null || true
rm -rf "$VM_STATE_DIR"
rm -f "$(socket_file_for "$VM_ID")"

