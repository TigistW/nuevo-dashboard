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
"$SCRIPT_DIR/stop_vm.sh" "$VM_ID"

