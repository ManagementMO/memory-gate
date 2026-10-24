#!/usr/bin/env bash
# npm run verify: everything that must be green before anyone demos (needs the local stack: scripts/start-all.sh).
# Type checks, domain tests, builds, fixture-only browser rooms and free doctor pings.
# Paid browser checks require the explicit npm run verify:live / E2E_LIVE=1 opt-in.
set -uo pipefail
cd "$(dirname "$0")/.."
declare -a RESULTS; FAIL=0
step() { local name="$1"; shift; local t0=$(date +%s); if "$@" > ".logs/verify-${name// /_}.log" 2>&1; then RESULTS+=("PASS  $name ($(( $(date +%s) - t0 )) s)"); else RESULTS+=("FAIL  $name (see .logs/verify-${name// /_}.log)"); FAIL=1; fi; }
mkdir -p .logs
step "typecheck backend" npx tsc -p tsconfig.json --noEmit
step "typecheck headset" bash -c 'cd apps/headset && npm run typecheck'
step "typecheck phone" bash -c 'cd apps/phone && npm run typecheck'
step "smoke tests" npm test
step "headset reconciliation" npm run test:headset
step "phone build" bash -c 'cd apps/phone && npm run build'
step "headset build" bash -c 'cd apps/headset && npm run build'
step "e2e (two phones, LAN, security)" npm run e2e
step "doctor" npm run doctor
printf '%s\n' "${RESULTS[@]}"
grep -h -E "Tests +[0-9]+ passed|[0-9]+ passed \(" .logs/verify-smoke_tests.log .logs/verify-e2e* 2>/dev/null | sed 's/^/      /'
exit $FAIL
