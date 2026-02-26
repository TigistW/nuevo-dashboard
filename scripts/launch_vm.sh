#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

if [[ $# -lt 7 ]]; then
  echo "Usage: $0 <vm_id> <kernel> <rootfs> <ram_mb> <cpu_cores> <tap_dev> <namespace>" >&2
  exit 1
fi

VM_ID="$1"
KERNEL_INPUT="$2"
ROOTFS_INPUT="$3"
RAM_MB="$4"
CPU_CORES="$5"
TAP_DEV="$6"
NAMESPACE="$7"

FIRECTL_BIN="$(require_bin firectl)"
KERNEL_PATH="$(resolve_kernel "$KERNEL_INPUT")"
ROOTFS_PATH="$(resolve_rootfs "$ROOTFS_INPUT")"
SOCKET_PATH="$(socket_file_for "$VM_ID")"
VM_STATE_DIR="$(vm_state_dir "$VM_ID")"
VM_PID_FILE="$(pid_file_for "$VM_ID")"

if [[ ! -f "$KERNEL_PATH" ]]; then
  echo "Kernel not found: $KERNEL_PATH" >&2
  exit 1
fi
if [[ ! -f "$ROOTFS_PATH" ]]; then
  echo "Rootfs not found: $ROOTFS_PATH" >&2
  exit 1
fi

ensure_dir "$VM_STATE_DIR"
ensure_dir "$SOCKETS_DIR"
ensure_dir "$LOGS_DIR"

ip netns add "$NAMESPACE" 2>/dev/null || true
ip tuntap add dev "$TAP_DEV" mode tap 2>/dev/null || true
ip link set "$TAP_DEV" up

nohup "$FIRECTL_BIN" \
  --id "$VM_ID" \
  --kernel "$KERNEL_PATH" \
  --root-drive "$ROOTFS_PATH" \
  --memory "$RAM_MB" \
  --ncpus "$CPU_CORES" \
  --tap-device "$TAP_DEV" \
  --socket-path "$SOCKET_PATH" \
  > "$LOGS_DIR/$VM_ID.log" 2>&1 &

echo $! > "$VM_PID_FILE"
print_public_ip || true

