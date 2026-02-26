#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <vm_id>" >&2
  exit 1
fi

VM_ID="$1"
VM_PID_FILE="$(pid_file_for "$VM_ID")"

if [[ -f "$VM_PID_FILE" ]]; then
  PID="$(cat "$VM_PID_FILE" || true)"
  if [[ -n "${PID:-}" ]]; then
    kill "$PID" 2>/dev/null || true
  fi
fi

pkill -f "firectl.*${VM_ID}" 2>/dev/null || true

