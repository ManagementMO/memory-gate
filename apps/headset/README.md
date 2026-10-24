# Memory Gate · headset (practice build, sample content)

IWSDK 1.0.1 mixed-reality app for Meta Quest 3: the room's Gaussian-splat memory (Spark 2.4.0), spoken objects as
ghosts that settle on confirm, push-to-talk, the companion light and captions, replay, pause. Everything shown comes
from the Convex backend; see `src/app.ts`. Read `AGENTS.md` (IWSDK rules) before changing the project setup.

## Run

The local Convex backend must already be running (repo root `.env.local` → `CONVEX_URL`). The dev server proxies
`/api` (HTTP + WebSocket + file storage) to it, so a browser needs only this one HTTPS origin.

```sh
npm install                      # exact versions from package-lock.json
npm run room                     # test room: prints its code (token saved in .test-room.json, gitignored)
npm run dev:vite                 # HTTPS dev server on :8081 (LAN too), no managed browser
#   desktop:  https://localhost:8081/?room=CODE
#   Quest:    https://<mac-ip>:8081/?room=CODE   (same Wi-Fi; `ipconfig getifaddr en0`; accept the cert warning)
#   USB:      adb reverse tcp:8081 tcp:8081, then https://localhost:8081/?room=CODE on the Quest
npm run dev:headless             # or: IWSDK-managed emulator browser (npx iwsdk xr …, npx iwsdk browser …)
npm run typecheck
```

Production bundle (faster first load on the Quest): `npm run build && npx vite preview --port 4173 --host 0.0.0.0`
(preview keeps the HTTPS cert and the `/api` proxy).

Spectator (projector for people without the headset): `https://<mac-ip>:8081/?room=CODE&view=spectator` — read-only
viewer, story ticker, bigger captions, slow drift (`&drift=0` stops it), silent unless `&audio=1` (then click "Turn on
sound" for the chimes). `npm run shoot:spectator` screenshots it. The phone's `splat.lite` flag swaps in the 250k room live.

URL switches: `?room=CODE` · `?name=Grandma` (storyteller name at first join) · `?voice=mock` (typed stub) ·
`?multiview=on` · `?scale=0.75` · `?tm=aces` · `?hud=1` · `?convex=<url>` (desktop debugging) ·
dev only: `?check=models` (library facing), `?check=objects` (object states), `?debug=floor&cam=side`.

Controls: desktop: hold Space or "Hold to talk" (mouse aims), click a settled object to replay it, P pauses.
XR: hold the right trigger to talk (a short click on a settled object replays it), A confirms the ghost in front of
you, B pauses/resumes; hands: pinch to talk.

## Test scripts (`scripts/`)

`make-room.mjs` · `shoot.mjs` (desktop screenshots of every state) · `lan-check.mjs` (Quest-style LAN load through
the proxy) · `emu-open.mjs`, `emu-act.mjs` (IWSDK managed emulator) · `live-model.mjs` (one Tripo re-texture →
cross-dissolve) · `voice-e2e.mjs` (real voice module with Chrome's fake mic). Screens go to `../../evidence/screens/`.
