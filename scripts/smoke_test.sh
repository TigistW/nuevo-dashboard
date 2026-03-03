#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
WORKFLOW_ID="${WORKFLOW_ID:-real-api-lane}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
RUN_BACKEND_TESTS="${RUN_BACKEND_TESTS:-0}"

info() {
  printf '[INFO] %s\n' "$1"
}

ok() {
  printf '[OK] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing required command: $cmd"
}

http_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local tmp
  tmp="$(mktemp)"

  local code
  if [[ -n "$body" ]]; then
    code="$(
      curl -sS \
        --max-time "$TIMEOUT_SECONDS" \
        -o "$tmp" \
        -w '%{http_code}' \
        -X "$method" \
        -H 'Accept: application/json' \
        -H 'Content-Type: application/json' \
        -d "$body" \
        "${BASE_URL}${path}"
    )"
  else
    code="$(
      curl -sS \
        --max-time "$TIMEOUT_SECONDS" \
        -o "$tmp" \
        -w '%{http_code}' \
        -X "$method" \
        -H 'Accept: application/json' \
        "${BASE_URL}${path}"
    )"
  fi

  if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
    local response
    response="$(cat "$tmp" 2>/dev/null || true)"
    rm -f "$tmp"
    fail "HTTP ${code} for ${method} ${path}: ${response}"
  fi

  cat "$tmp"
  rm -f "$tmp"
}

require_cmd curl
require_cmd python3

info "Smoke test started (BASE_URL=${BASE_URL}, WORKFLOW_ID=${WORKFLOW_ID})."

if [[ "$RUN_BACKEND_TESTS" == "1" ]]; then
  info "Running backend integration tests."
  python -m compileall backend -q
  python -m unittest discover backend/tests/integration -v
  ok "Backend integration tests passed."
fi

root_json="$(http_json GET '/')"
root_status="$(
  python3 -c 'import sys, json; print(str(json.load(sys.stdin).get("status", "")))' <<<"$root_json"
)"
[[ "$root_status" == "online" ]] || fail "Backend root status expected 'online', got '${root_status}'."
ok "Backend health endpoint is online."

n8n_role_json="$(http_json GET '/api/v1/architecture/n8n-role')"
n8n_role="$(
  python3 -c 'import sys, json; print(str(json.load(sys.stdin).get("role", "")))' <<<"$n8n_role_json"
)"
[[ -n "$n8n_role" ]] || fail "n8n role endpoint returned empty role."
ok "n8n role is '${n8n_role}'."

workflows_json="$(http_json GET '/api/v1/n8n/workflows')"
workflow_exists="$(
  python3 - "$WORKFLOW_ID" <<'PY' <<<"$workflows_json"
import json, sys
target = sys.argv[1]
items = json.loads(sys.stdin.read() or "[]")
print("1" if any(str(item.get("workflow_id")) == target for item in items) else "0")
PY
)"
[[ "$workflow_exists" == "1" ]] || fail "Workflow '${WORKFLOW_ID}' not found in /api/v1/n8n/workflows."
ok "Workflow '${WORKFLOW_ID}' is registered."

run_payload="$(cat <<JSON
{"workflow_id":"${WORKFLOW_ID}","trigger":"smoke_test","context":{"source":"scripts/smoke_test.sh"}}
JSON
)"
run_json="$(http_json POST '/api/v1/n8n/runs' "$run_payload")"
run_id="$(
  python3 -c 'import sys, json; print(str(json.load(sys.stdin).get("id", "")))' <<<"$run_json"
)"
run_status="$(
  python3 -c 'import sys, json; print(str(json.load(sys.stdin).get("status", "")))' <<<"$run_json"
)"
[[ -n "$run_id" ]] || fail "Run creation did not return an id."
[[ "$run_status" == "running" ]] || fail "Run '${run_id}' expected status 'running', got '${run_status}'."
ok "Run created: ${run_id}"

event_payload='{"phase":"verification","status":"running","message":"Smoke event from script.","details":"API lifecycle validation"}'
event_json="$(http_json POST "/api/v1/n8n/runs/${run_id}/events" "$event_payload")"
events_count="$(
  python3 -c 'import sys, json; print(len(json.load(sys.stdin).get("events", [])))' <<<"$event_json"
)"
[[ "$events_count" -ge 1 ]] || fail "Run '${run_id}' events list is empty after append."
ok "Run event append succeeded."

finish_payload='{"status":"succeeded","message":"Smoke test run completed."}'
finish_json="$(http_json PUT "/api/v1/n8n/runs/${run_id}" "$finish_payload")"
finish_status="$(
  python3 -c 'import sys, json; print(str(json.load(sys.stdin).get("status", "")))' <<<"$finish_json"
)"
[[ "$finish_status" == "succeeded" ]] || fail "Run '${run_id}' expected final status 'succeeded', got '${finish_status}'."
ok "Run completion update succeeded."

run_verify_json="$(http_json GET "/api/v1/n8n/runs/${run_id}")"
verify_status="$(
  python3 -c 'import sys, json; print(str(json.load(sys.stdin).get("status", "")))' <<<"$run_verify_json"
)"
verify_finished_at="$(
  python3 -c 'import sys, json; print(str(json.load(sys.stdin).get("finished_at", "")))' <<<"$run_verify_json"
)"
[[ "$verify_status" == "succeeded" ]] || fail "Run '${run_id}' verification status mismatch: '${verify_status}'."
[[ -n "$verify_finished_at" && "$verify_finished_at" != "None" ]] || fail "Run '${run_id}' missing finished_at timestamp."
ok "Run persisted with terminal status and finished timestamp."

captcha_json="$(http_json GET '/api/v1/verification/captcha/summary')"
captcha_total="$(
  python3 -c 'import sys, json; print(int(json.load(sys.stdin).get("total", 0)))' <<<"$captcha_json"
)"
[[ "$captcha_total" -ge 0 ]] || fail "CAPTCHA summary total should be >= 0."
ok "CAPTCHA summary endpoint responded."

queue_json="$(http_json GET '/api/v1/automation/scheduler/queue')"
queue_type="$(
  python3 -c 'import sys, json; data=json.load(sys.stdin); print("list" if isinstance(data, list) else type(data).__name__)' <<<"$queue_json"
)"
[[ "$queue_type" == "list" ]] || fail "Scheduler queue endpoint did not return a list."
ok "Scheduler queue endpoint responded."

info "All smoke checks passed."
printf '\nPASS: backend + n8n lifecycle smoke test completed successfully.\n'
