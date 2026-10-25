# Red Kite team handoff — October 24, 2026

The two-perspective Red Kite is implemented in the actual Gate app. Open `https://localhost:5180/?story=red-kite` after starting local Convex and Gate. The portal also has an “Explore The Red Kite · two tellings” link. The first visit creates a fictional sample with the already-cached meadow; returning reopens it. No provider generation is required.

Pull the current `ManagementMO/memory-gate` main, then work in separate branches/clones. The integration owner is finishing review and documentation. Coordinate before editing `apps/gate/src/red-kite/`, `convex/redKite.ts` or the shared story contract.

## Teammate A: make the five original props more beautiful

Start with the existing editable source `assets/red-kite/source/red-kite-assets.blend` and reproducible builder `tools/red-kite/build_assets.py`. Exports are in `apps/gate/public/red-kite/models/`; dimensions, hashes and node inventories are in `apps/gate/public/red-kite/manifest.json`. These are real working GLBs, not an empty assignment.

Prioritize a more tactile paper sail, natural ribbon folds, softened wooden end caps and a convincing box interior. Refine the existing coherent set before adding scenery or people. Keep geometry and textures economical; the current set is about 407 KB and 5,612 triangles total.

Preserve `KiteRoot`, `KiteSail`, `KitePaper`, `StringAnchor`, `BridleAnchor`, `TailRoot`, `Tail_00` through `Tail_08`, `SpoolRoot`, `StringExit`, `SupportRoot`, `SupportTop`, `KeepsakeRoot`, `LidPivot`, `StoryCardDock` and `StoryCardRoot`. Preserve meters, +Z front and existing pivots. The runtime connects the two string anchors and animates the tail/lid. Do not bake a long string to an arbitrary world position or recolor the shared cached mesh globally.

Rebuild in a new background Blender process, not an unsaved shared GUI scene:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/red-kite/build_assets.py
node tools/red-kite/validate_assets.mjs
npm --prefix apps/gate run typecheck
```

Inspect actual Gate context renders from Elena and Rosa, close up and from the back. Keep the source and exports together in your commit. Consult `TEAMMATE_ASSET_BRIEF.md` for the detailed art contract, but do not rebuild the already-integrated app or create a second XR stack.

## Teammate B: run the physical Quest 3 acceptance pass

Start Gate with `npm --prefix apps/gate run dev`. Use the HTTPS network address printed by Vite on the same Wi-Fi as the laptop; accept its local development certificate. Keep Convex reachable through the app's existing `/api` proxy. The headset must use the laptop's LAN address, not its own `localhost`.

Open the story on the laptop as host. “Invite a viewer” copies a read-only room link; open that link in the headset, replacing localhost with the laptop's LAN address if necessary. Enter Quest VR. The host can progress the telling while the headset visitor independently chooses Elena or Rosa. For full author controls on a headset, open `?story=red-kite` without a room code on that device and let it create its own sample.

Check these using real hardware and record observations:

- X switches telling with a fade; A advances for an author; B rests; Y leaves VR. The in-world buttons provide pointing alternatives. Tap the name for the labeled computer sample voice.
- Point/trigger at the spool, then test a nearby squeeze grab. Lift gently and release. Switch or rest while holding; the spool must release and return to its fixed support.
- A read-only visitor cannot accept details or resume a host-paused room.
- Read every caption comfortably, look down at the floor and table, turn naturally, and compare both views. Check seated as well as standing. Record whether the table is comfortably reachable; emulator input is not reach validation.
- Measure frame timing and dropped frames in the full 500k meadow for at least a minute. The 100k “Lighter meadow” option is visibly rougher and is an explicit fallback. Pick the hardware quality setting from measured performance and appearance.
- Test headset microphone/speaker permissions only when integrating real speech. This sample currently uses written fixture lines and a labeled browser computer voice.

Desktop and IWER controller tests already pass. They do not establish Quest comfort, hand-pinch behavior, audio quality or sustained hardware frame rate.

## Teammate C: prepare the real two-speaker story

The working demonstration is deliberately fictional. `packages/shared/src/redKite.ts` supplies eight source lines, while `convex/redKite.ts` stores separate playheads, source records and illustration choices. Do not replace real participant words with generated fixture text or pretend the current sample voice is a family recording.

With each participant's permission, capture a short telling of one shared afternoon. Keep the original clip and exact speaker attribution. Have a bilingual teammate check the transcript/translation, including names, color words and uncertainty. Preserve differences rather than picking the person who is “right.” A younger-onset Alzheimer's diagnosis must never be used as a credibility score.

The next integration should adapt consented source utterances into the same source-linked proposal/choice boundary. The selected viewpoint stays local. An unknown color stays open until someone explicitly chooses an illustration from that telling. Existing general speech/provider services are available in the repo, but this Red Kite route does not yet drive arbitrary scenes from live speech.

## Validation and scope

From the repo root, `node apps/gate/scripts/red-kite-check.mjs` exercises the real browser UI; `node apps/gate/scripts/red-kite-xr-check.mjs` drives IWER's actual controller/pose event path. Both use the ignored `.logs/red-kite-demo-room.json` created by `npm run demo:kite`. They never print its token. Evidence is in `evidence/red-kite/`.

Do not request another World Labs world as part of these assignments. The approved meadow is cached and the local generation count remains five of five. Keep the old IWSDK client as a separate fallback; do not pass Three objects between its runtime and Gate.
