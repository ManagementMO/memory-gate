#!/usr/bin/env bash
# One dogfood round: every automated check, with artifacts for review, under docs/dogfood/round-N/.
#   apps/gate/scripts/dogfood.sh N [--live]   (--live adds the real voice loop and a photo with Claude; costs cents)
# The scoring itself is done by a person (or Claude) looking at the screenshots against docs/dogfood/RUBRIC.md.
set -uo pipefail
cd "$(dirname "$0")/../../.."
N="${1:?round number}"; LIVE="${2:-}"
OUT="docs/dogfood/round-$N"; SHOTS="apps/gate/.shots/round-$N"
mkdir -p "$OUT" "$SHOTS"
SUMMARY="$OUT/checks.txt"; : > "$SUMMARY"
step() { echo "== $1" | tee -a "$SUMMARY"; }
pass() { echo "   PASS $1" | tee -a "$SUMMARY"; }
fail() { echo "   FAIL $1" | tee -a "$SUMMARY"; }

step "backend runs the current shared code"
# The local Convex dev server only watches convex/; shared code it imports (packages/shared) needs a nudge.
touch convex/sketch.ts
for i in $(seq 1 30); do sleep 2; tail -1 .logs/convex.log | grep -q "ready!" && break; done
tail -1 .logs/convex.log | grep -q "ready!" && pass "backend redeployed" || fail "backend redeploy (see .logs/convex.log)"

step "typecheck"
if (cd apps/gate && npx tsc -p tsconfig.json --noEmit > "../../$OUT/typecheck.txt" 2>&1); then pass "apps/gate typecheck"; else fail "apps/gate typecheck (see typecheck.txt)"; fi

step "production build"
if (cd apps/gate && npx vite build > "../../$OUT/build.txt" 2>&1); then pass "vite build ($(grep -o 'built in [0-9.]*s' "$OUT/build.txt"))"; else fail "vite build (see build.txt)"; fi

step "journey: desktop, words, Figure (offline room, no voice)"
node apps/gate/scripts/flow.mjs "$SHOTS/desktop-figure" --companion figure > "$OUT/flow-desktop-figure.txt" 2>&1
grep -q "final stage: album" "$OUT/flow-desktop-figure.txt" && pass "reached the album" || fail "journey did not finish"
grep -E "errors: [0-9]+" "$OUT/flow-desktop-figure.txt" | tail -1 | sed 's/^/   /' | tee -a "$SUMMARY"

step "journey: phone 390x844, words, Light (offline room, no voice)"
node apps/gate/scripts/flow.mjs "$SHOTS/phone-light" --mobile --companion light > "$OUT/flow-phone-light.txt" 2>&1
grep -q "final stage: album" "$OUT/flow-phone-light.txt" && pass "reached the album" || fail "journey did not finish"
grep -E "errors: [0-9]+" "$OUT/flow-phone-light.txt" | tail -1 | sed 's/^/   /' | tee -a "$SUMMARY"

step "the aurora gate still works (?world=aurora, Light)"
node apps/gate/scripts/flow.mjs "$SHOTS/aurora-light" --world aurora --companion light > "$OUT/flow-aurora-light.txt" 2>&1
grep -q "final stage: album" "$OUT/flow-aurora-light.txt" && pass "reached the album" || fail "aurora journey did not finish"

step "headset rehearsal (emulated Quest 3)"
node apps/gate/scripts/xr-check.mjs "$SHOTS/xr" > "$OUT/xr.txt" 2>&1
grep -q '"stage":"album","xr":false' "$OUT/xr.txt" && pass "entered VR, formed a memory, exited to the album" || fail "headset rehearsal (see xr.txt)"
grep -E "frames rendered|errors:" "$OUT/xr.txt" | sed 's/^/   /' | tee -a "$SUMMARY"

step "album interactions"
node apps/gate/scripts/album-shots.mjs "$SHOTS/album" > "$OUT/album.txt" 2>&1 && pass "album shots" || fail "album shots (see album.txt)"
tail -3 "$OUT/album.txt" | sed 's/^/   /' | tee -a "$SUMMARY"

step "frame rate (headless Chrome on this Mac, not a Quest measurement)"
node apps/gate/scripts/fps.mjs "https://localhost:5180/?voice=off&mode=offline" | sed 's/^/   portal /' | tee -a "$SUMMARY"
node apps/gate/scripts/fps.mjs "https://localhost:5180/?preview=scene&plan=/eval/livingroom.json&companion=none" | sed 's/^/   memory /' | tee -a "$SUMMARY"
node apps/gate/scripts/fps.mjs "https://localhost:5180/?voice=off&mode=offline&q=0.15" | sed 's/^/   portal at headset quality /' | tee -a "$SUMMARY"

step "generation renders"
for id in kitchen lake livingroom cafe; do
  node apps/gate/scripts/shot.mjs "https://localhost:5180/?preview=scene&plan=/eval/$id.json&companion=none" "$SHOTS/scene-$id.png" --wait 15000 > /dev/null 2>&1 && pass "rendered $id" || fail "render $id"
done

if [ "$LIVE" = "--live" ]; then
  step "live: hands-free voice loop (synthesized speech as the microphone)"
  node apps/gate/scripts/voice-e2e.mjs "${MIC_WAV:?set MIC_WAV}" "$SHOTS/voice" > "$OUT/voice.txt" 2>&1
  grep -q "stage → memory" "$OUT/voice.txt" && pass "spoken description reached the memory" || fail "voice loop (see voice.txt)"
  grep -E "heard:|companion:|errors:" "$OUT/voice.txt" | sed 's/^/   /' | tee -a "$SUMMARY"
  step "live: two devices in the same room (nearby join, quiet guest, lights, look-here mark)"
  node apps/gate/scripts/multiplayer-check.mjs "$SHOTS/multiplayer" > "$OUT/multiplayer.txt" 2>&1 && pass "multiplayer" || fail "multiplayer (see multiplayer.txt)"
  grep -E "PASS|FAIL|errors:" "$OUT/multiplayer.txt" | sed 's/^/   /' | tee -a "$SUMMARY"
  step "live: photo with Claude vision"
  node apps/gate/scripts/flow.mjs "$SHOTS/photo" --live --photo fixtures/sample-photo-1938.jpg > "$OUT/photo.txt" 2>&1
  grep -q "final stage: album" "$OUT/photo.txt" && pass "photo journey reached the album" || fail "photo journey (see photo.txt)"
  grep -E "companion:|errors:" "$OUT/photo.txt" | head -6 | sed 's/^/   /' | tee -a "$SUMMARY"
fi
echo "done: $OUT" | tee -a "$SUMMARY"
