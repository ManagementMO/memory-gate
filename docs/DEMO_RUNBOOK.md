# Current operator runbook

The spoken run-of-show is in ../DEMO_SCRIPT.md. Use the supported actions there; the main sample uses the original illustrative courtyard. Generated worlds are cached for review, with the courtyard's wide-view stretching explicitly recorded.

## Start and reopen

1. From the repository run scripts/start-all.sh, npm run doctor, then npm run demo:links.
2. Open laptopPhone on the Mac or phoneOnWifi on the storyteller phone. Join through the family link with your name. HTTPS port 5174 supports the mic; accept the local certificate and choose Enable microphone.
3. Open the spectator link on the projector. For the Quest use questOnWifi (port 4173) and complete QUEST_CHECKLIST.md before claiming device readiness.
4. Record a supported correction, review gold, confirm, select the moved bench to replay the source, then undo. Original recordings require the recording permission.
5. Native interactions: short trigger click selects/replays/opens the gate; hold trigger talks; A confirms; B pauses; near the keepsake, squeeze/grip holds it and release returns it.

The links command does not reset or create a room. npm run demo:room creates a fresh illustrative fixture if needed. Reset demo room is scoped to the named sample and keeps its photo/scenery/permissions; use Load four illustrative props afterwards. Never reset a real memory to prepare a demo.

## Recovery

- Speech unavailable: type the same command and acknowledge the keyboard path.
- Wrong or stale preview: dismiss it and make a fresh proposal. No lo muevas / Don't move it preserve the current scene; they do not confirm it.
- Generated scenery distracting: Photo → Use illustrative courtyard. Accepted props and story remain. Show this room can reopen the cached world; it does not generate another one.
- World download failed after acknowledgement: Room settings → Recover existing world. This polls/downloads the saved operation, without another generation POST. Missing metric metadata remains blocked.
- Backend restart: clients reconnect. scripts/start-all.sh starts checkout-owned services; the local persistent data must remain on this Mac.
- Physical XR not ready: show the tested browser flow and keep the headset check open.

## Accounts and limits

Anthropic, Cartesia and World Labs are configured in ignored auth/memory-gate.env and authenticated in the local backend. No additional provider key is needed for the default demonstration. The relevant setup commands are npm run env:push, npm run services:live and npm run doctor.

Three World Labs jobs have been submitted in this review. The default global cap is used; current cached worlds still work. API credits are distinct from Marble web credits. A deliberate later operator change to WORLD_LABS_GENERATION_LIMIT permits a later funded run; no automatic increase or purchase occurs. No Modal worker is needed for the current demo.

## Verification and backup

npm run verify is fixture-only. npm run verify:live explicitly uses paid speech/translation. npm run test:xr drives the real immersive emulator, not a mocked XR availability check.

The current silent backup is evidence/review-2026-10-23/demo-correction.webm, captured from the actual synthesized-speech browser flow. Fresh screenshots, provider, production and restart evidence are under the same review directory. Hardware and real-family evidence remain separate.
