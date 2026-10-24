#!/usr/bin/env bash
# Stop only processes whose working directory belongs to this checkout. Never pkill every Convex or Python worker.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
owned() {
  local dir
  dir="$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  [ "$dir" = "$ROOT" ] || [[ "$dir" == "$ROOT/"* ]]
}
for service in worker convex; do
  if [ -f ".logs/$service.pid" ]; then
    pid="$(cat ".logs/$service.pid")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && owned "$pid"; then
      kill -INT "$pid" 2>/dev/null || true
      echo "$service interrupt sent (pid $pid)"
    fi
  fi
done
for pid in $(lsof -nP -tiTCP:8081 -sTCP:LISTEN 2>/dev/null); do
  if owned "$pid"; then (cd apps/headset && npx @iwsdk/cli dev down); fi
done
for port in 4173 5173 5174 8081 3210; do
  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
    if owned "$pid"; then kill "$pid" 2>/dev/null && echo "port $port stopped (pid $pid)";
    else echo "port $port belongs to another checkout; left running"; fi
  done
done
if [ -f .logs/worker.pid ]; then
  pid="$(cat .logs/worker.pid)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    echo 'GPU worker still exiting. Check npm run doctor -- --modal before assuming remote GPU resources stopped.'
  fi
fi
