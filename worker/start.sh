#!/usr/bin/env bash
# Start the Memory Gate GPU worker (local process; ephemeral Modal app; stops cleanly on Ctrl-C).
# Loads ONLY the Modal token from the private config into this process's environment; never prints it.
# Usage: worker/start.sh [--prewarm] [--max-jobs N] [--exit-when-idle S] [--budget-gpu-s S] ...
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${MEMORY_GATE_ENV:-${MEMGATE_AUTH_FILE:-$HERE/../auth/memory-gate.env}}"
[ -r "$ENV_FILE" ] || { echo "No private credentials file at $ENV_FILE; GPU worker not started."; exit 2; }
get() { awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/, ""); gsub(/^["\047]|["\047]$/, ""); print; exit}' "$ENV_FILE"; }
MODAL_TOKEN_ID="$(get MODAL_TOKEN_ID)"
MODAL_TOKEN_SECRET="$(get MODAL_TOKEN_SECRET)"
if [ -z "$MODAL_TOKEN_ID" ] || [ -z "$MODAL_TOKEN_SECRET" ]; then echo "Modal token not set in $ENV_FILE; not starting."; exit 2; fi
export MODAL_TOKEN_ID MODAL_TOKEN_SECRET
[ -f "$HERE/../.env.worker" ] || { echo "Missing .env.worker (run: npm run env:push)"; exit 2; }
command -v node >/dev/null || { echo "node not on PATH"; exit 2; }

# Python with modal==1.6.1 in worker/.venv (created on first use).
PY=""
for cand in "$HERE/.venv/bin/python"; do
  if [ -x "$cand" ] && "$cand" -c 'import modal' >/dev/null 2>&1; then PY="$cand"; break; fi
done
if [ -z "$PY" ]; then
  echo "No Python with modal found; creating $HERE/.venv with modal==1.6.1"
  python3 -m venv "$HERE/.venv"
  "$HERE/.venv/bin/pip" install -q 'modal==1.6.1'
  PY="$HERE/.venv/bin/python"
fi
[ -d "$HERE/node_modules/@adobe/spz" ] || (cd "$HERE" && npm ci --no-audit --no-fund)
cd "$HERE/.."
exec "$PY" -u "$HERE/sharp_worker.py" "$@"
