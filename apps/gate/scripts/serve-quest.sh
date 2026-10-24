#!/usr/bin/env bash
# Serve the production build for the Quest (and phones) over HTTPS on this Mac's Wi-Fi address.
# The dev server's live-reload can end a headset session when its socket drops; the production build can't.
#   apps/gate/scripts/serve-quest.sh        (the Convex backend must already be running: scripts/start-all.sh or npm run dev:convex)
set -euo pipefail
cd "$(dirname "$0")/.."
npx vite build > /dev/null
if lsof -nP -iTCP:4180 -sTCP:LISTEN > /dev/null 2>&1; then echo "preview already running on :4180 (restart it to serve this build)"; else
  nohup npx vite preview --port 4180 --host 0.0.0.0 > ../../.logs/gate-preview.log 2>&1 &
  sleep 2
fi
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)"
cat <<MSG

Memory Gate is ready.
  Quest Browser / phone (same Wi-Fi):  https://$IP:4180
  This Mac:                            https://localhost:4180

On the Quest: open the link, choose Advanced → Proceed on the certificate warning (it's this Mac's own local
certificate), tap Begin and allow the microphone, then tap "Enter in headset".
Keep this Mac awake and on the same Wi-Fi.
MSG
