# Current operator runbook

The spoken run-of-show is in ../DEMO_SCRIPT.md. The main sample uses the new World Labs courtyard generated from fictional story words. The older world made from a wide illustrative screenshot remains historical review material.

## Start and reopen

1. From the repository run scripts/start-all.sh, npm run seed:world, npm run demo:journey, npm run doctor, then npm run demo:links. Reopening the prepared courtyard does not submit a generation.
2. Open laptopPhone on the Mac or phoneOnWifi on the storyteller phone. Join through the family link with your name. HTTPS port 5174 supports the mic; accept the local certificate and choose Enable microphone.
3. Open the spectator link on the projector. For the Quest use questOnWifi (port 4173) and complete QUEST_CHECKLIST.md before claiming device readiness.
4. Start with the empty prepared place. Record “There was a wooden bench. We used to sit there together after lunch.” Stop and share, review gold, confirm, then select the bench to replay the captured source. Original recordings require recording permission. Typed input is an available fallback and is labeled as typed.
5. Native interactions: short trigger click selects/replays/opens the gate; hold trigger talks; A confirms; B pauses; near the keepsake, squeeze/grip holds it and release returns it.

The links command does not reset or create a room. npm run demo:journey reopens the current story demo; --new explicitly prepares another empty sample. npm run demo:room creates the separate illustrative four-prop rehearsal. Reset keeps scenery, its source words and permissions, while removing objects and captured audio; it is not a substitute for Delete this memory. Never reset a real memory to prepare a demo.

## Recovery

- Speech unavailable: type the same command and acknowledge the keyboard path.
- Wrong or stale preview: dismiss it and make a fresh proposal. No lo muevas / Don't move it preserve the current scene; they do not confirm it.
- Generated scenery distracting: Photo → Use illustrative courtyard. Accepted props and story remain. Show this room can reopen the cached world; it does not generate another one.
- World download failed after acknowledgement: Room settings → Recover existing world. This polls/downloads the saved operation, without another generation POST. Missing metric metadata remains blocked.
- Backend restart: clients reconnect. scripts/start-all.sh starts checkout-owned services; the local persistent data must remain on this Mac.
- Physical XR not ready: show the tested browser flow and keep the headset check open.

## Accounts and limits

Anthropic, Cartesia and World Labs are configured in ignored auth/memory-gate.env and authenticated in the local backend. No additional provider key is needed for the default demonstration. The relevant setup commands are npm run env:push, npm run services:live and npm run doctor.

Four World Labs jobs have been submitted across the reviews. The fourth was explicitly authorized by the user; its provider-reported cost is 1,580 credits. The private local cap is now 4/4. Cached worlds still work. API credits are distinct from Marble web credits. No automatic cap increase, paid retry or purchase occurs. No Modal worker is needed for the current demo.

## Verification and backup

npm run verify is fixture-only. npm run verify:live explicitly uses paid speech/translation. npm run test:xr drives the real immersive emulator, not a mocked XR availability check.

The current silent story backup is evidence/world-story/world-story-demo.webm. It shows actual synthetic microphone capture → live STT/Claude → 3D suggestion → human confirmation → pointer-selected original clip replay in the cached world. The capture has no audio track; the browser test separately asserts original audio playback. Earlier Spanish correction evidence remains in evidence/review-2026-10-23/. Hardware and real-family evidence remain separate.
