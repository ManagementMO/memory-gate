#!/usr/bin/env bash
# Start the practice build locally in the background (logs in .logs/):
#   backend (Convex :3210) · headset dev (https :8081) · headset Quest build (https :4173) · phone (http :5173)
#   --worker also starts the GPU worker (SHARP on Modal; bills per second while warm; exits after 15 min idle)
#   --no-quest skips the production build for the Quest (faster start)
# Already-running services are left alone. Stop everything with scripts/stop-all.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"; mkdir -p .logs
WORKER=0; QUEST=1
for a in "$@"; do case "$a" in --worker) WORKER=1;; --no-quest) QUEST=0;; esac; done
up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
wait_port() { for _ in $(seq 1 90); do up "$1" && return 0; sleep 1; done; return 1; }
IP="$(ipconfig getifaddr en0 2>/dev/null || echo localhost)"
for folder in . apps/phone apps/headset; do
  if [ ! -d "$folder/node_modules" ]; then (cd "$folder" && npm ci); fi
done

if up 3210; then echo "backend   already running (:3210)"; else
  echo "backend   starting…"; node scripts/background.mjs convex . .logs/convex.log npm run dev:convex
  for _ in $(seq 1 90); do grep -q "Convex functions ready" .logs/convex.log 2>/dev/null && break; sleep 1; done
  grep -q "Convex functions ready" .logs/convex.log && echo "backend   ready" || { echo "backend   NOT ready, see .logs/convex.log"; exit 1; }
fi
if [ ! -f .env.worker ]; then npm run env:push; fi
node --experimental-transform-types scripts/ensure-seeded.mjs
if up 8081; then echo "headset   already running (:8081)"; else
  echo "headset   starting managed server (no browser window)…"; (cd apps/headset && npx @iwsdk/cli dev up --no-open --timeout 45000 > "$ROOT/.logs/headset.log" 2>&1)
  wait_port 8081 && echo "headset   ready" || echo "headset   NOT ready, see .logs/headset.log"
fi
if up 5174; then echo "voice phone already running (:5174)"; else
  echo "voice phone starting HTTPS…"; node scripts/background.mjs phone-https apps/phone .logs/phone-https.log npm run dev:https
  wait_port 5174 && echo "voice phone ready" || { echo "voice phone NOT ready, see .logs/phone-https.log"; exit 1; }
fi
if [ "$QUEST" = 1 ]; then
  if up 4173; then echo "quest     already running (:4173)"; else
    echo "quest     building the production app (about 1 min)…"
    (cd apps/headset && npm run build > "$ROOT/.logs/headset-build.log" 2>&1 < /dev/null)
    node scripts/background.mjs headset-preview apps/headset .logs/headset-preview.log npm run preview -- --port 4173 --host 0.0.0.0
    wait_port 4173 && echo "quest     ready" || echo "quest     NOT ready, see .logs/headset-build.log / headset-preview.log"
  fi
fi
if up 5173; then echo "phone     already running (:5173)"; else
  echo "phone     starting…"; node scripts/background.mjs phone apps/phone .logs/phone.log npm run dev
  wait_port 5173 && echo "phone     ready" || echo "phone     NOT ready, see .logs/phone.log"
fi
if [ "$WORKER" = 1 ]; then
  if pgrep -f sharp_worker.py >/dev/null; then echo "worker    already running"; else
    echo "worker    starting (pre-warming a Modal L40S; ~30 s)…"; node scripts/background.mjs worker . .logs/worker.log worker/start.sh --prewarm --exit-when-idle 900
  fi
fi
cat <<MSG

Open:
  phone (voice)       https://$IP:5174   (accept local certificate, then Enable microphone)
  phone (keyboard)   http://$IP:5173
  headset on desktop  https://localhost:8081/?room=CODE
  headset on Quest    https://$IP:4173/?room=CODE   (same Wi-Fi; accept the certificate once)
  spectator/projector https://$IP:8081/?room=CODE&view=spectator
Health: npm run doctor -- --modal     Stop: scripts/stop-all.sh
MSG
