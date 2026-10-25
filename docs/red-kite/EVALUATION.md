# The Red Kite: evaluation and remaining work

Evaluated October 24, 2026. The two-perspective fictional demo is implemented in the actual Gate app. This record distinguishes real browser/stereo evidence from physical-headset and live-family work that still needs evaluation.

## What is implemented

| Deliverable | Current result |
| --- | --- |
| Actual app entry | The Gate portal links to `?story=red-kite`. It creates/reopens a browser-owned fictional sample or joins a room as a viewer. Cached-world setup is recoverable; a paused story reopens without unpausing. |
| One continuous World Labs meadow | The previously approved Marble 1.1 world is cached. No additional generation was submitted. Both viewpoints and their peripheral surroundings were checked in Gate. |
| Two personal and spatial perspectives | Elena looks along the path; Rosa looks back across the clearing from the oak side. Selection stays local to each viewer and never accepts a detail or moves another participant. |
| Separate sources and choices | Eight attributed fictional source records, per-telling revisions/playheads and explicit Use / Leave decisions. Unknown color never borrows from the other telling. Elena's red and Rosa's orange remain separately source-linked. |
| Five original Blender props | Paper kite with frame/bridle/ribbon, wound wooden spool, folding support table, hinged keepsake box and story card. Editable source, reproducible builder, embedded small textures and actual GLBs are committed. |
| Interactive scene | Dynamic string uses the actual exported string anchors. Desktop pointer capture, native controller ray input and a nearby squeeze grab lift and release the spool. Kite lift derives from actual vertical spool travel and is smoothed; grabbing alone does not raise it. A breeze button provides an alternative. |
| Voluntary viewpoint transition | Scene-space opaque mask, release/dock, stationary origin change, fade-in. The mask exists in the scene for immersive rendering. Head tracking stays active. Rest/disconnect cancels a pending mask at the current safe anchor. |
| Rest and reduced motion | Rest stops sample speech and procedural motion, safely releases capture and gates story writes. Browser reduced-motion preference freezes the idle kite/ribbon clock while retaining bounded explicit interaction. Preference changes during the visit are observed. |
| Source and keepsake presentation | Exact source text, separate comparison cards, an interactive box and an in-world comparison summary. Sample playback is labeled as a computer voice. No original family recording is attached. |
| Sharing and recovery | Read-only room links omit author tokens. Two browser contexts keep independent perspectives while receiving shared choices. Reconnect preserves decisions; the saved local viewpoint survives reload. |

## Actual spatial review

The generated result differs from the reference: it has a large nearby oak on the left and a smaller oak farther down the path. The implementation uses that actual geometry. The prop support stays at one shared world position; it does not move to follow a camera switch.

Elena's stationary feet anchor is `[0, 0, 0.25]`; Rosa's is `[-2, 0, -4]`, in meters. Provider scale is 2.6397884, with an inferred source eye height about 1.525 m. Desktop framing includes the spool after the first input check found it below the frame. The World Labs camera far plane remains 1,000 m, preserving distant hills/sky.

Actual Gate captures, not concept art:

- [Elena with her chosen red kite](../../evidence/red-kite/03-elena-red.png)
- [Rosa with her chosen orange kite](../../evidence/red-kite/04-rosa-orange.png)
- [Both source-linked tellings](../../evidence/red-kite/05-both-tellings.png)
- [Emulated stereo from Elena](../../evidence/red-kite/07-xr-elena.png)
- [Emulated stereo from Rosa](../../evidence/red-kite/08-xr-rosa.png)
- [Rosa looking left](../../evidence/red-kite/09-xr-rosa-left.png)
- [Rosa looking right](../../evidence/red-kite/09-xr-rosa-right.png)

The 500k world is the default. Actual 100k captures showed visibly coarse/streaked scenery; it remains an explicit “Lighter meadow” fallback. Spark uses its standard wider Gaussian kernel coverage for this environment. This is not a claim that every generated surface, arbitrary walking position or headset resolution is artifact-free. Physical scale, seated reach and sustained frame timing still need Quest evaluation.

The source scene is a fictional AI interpretation. The application does not turn differences between speakers into a truth score or a visualization of a person's brain.

## Verification

- 97 smoke tests cover existing server behavior plus independent narrator choices, source ownership, stale/repeat commands, viewer restrictions, pause, cleanup, transition timing, lift response, reduced motion and bootstrap recovery.
- 12 existing headset regression tests pass.
- Root, Gate and fallback-headset TypeScript checks pass. Both clients build. Existing large-bundle warnings remain; they are not physical performance measurements.
- Eleven actual-browser checks pass with no page errors. They exercise the real UI, unknown/declined/accepted choices, two sessions, source display, pointer capture/lift, switching while holding, pause/reload, reconnect, mobile rest and actual scene stability under reduced motion.
- Eight IWER checks pass with no page errors: immersive entry/frame advancement, masked local switch, A/trigger authoring, tracked head turns, ray and squeeze lift/release, B rest, read-only viewer pause protection and Y exit. Stereo uses a 64 mm IPD. The harness disables only the emulator's manual pose/gizmo updater so emulated tracked poses can drive the actual XR event path.
- All five GLBs pass Khronos glTF Validator 2.0.0-dev.3.10 with **zero errors and zero warnings**. The independent export check verifies hashes, one scene per GLB, required anchors, plausible meter scale and actual index-based triangle counts.
- Total exported models: **406,892 bytes and 5,612 triangles**. The source Blender file is also committed.
- The browser speech test invokes the real browser API, and deliberately injects one late callback to check cancellation. Audible quality and family speech are not measured by that test.
- A fresh whole-change review found no critical issue or authorization bypass. Its two P2 motion findings were reproduced with failing regressions and fixed: the 3D reduced-motion behavior and spool-height-driven kite response.

Reports: [browser](../../evidence/red-kite/browser-report.json), [XR](../../evidence/red-kite/xr-report.json), [glTF](../../evidence/red-kite/gltf-validation.json).

## Reproduce

From the repository root, with local Convex and Gate running:

```sh
npm run demo:kite
npm --prefix apps/gate run dev
# In another terminal:
npm run test:red-kite
npm test
npm run test:headset
npm run typecheck
npm --prefix apps/gate run typecheck
npm --prefix apps/gate run build
```

`demo:kite` checks cached hashes, reuses its private sample-room checkpoint and prepares both tellings. It never calls World Labs or changes live provider flags. Browser checks read that ignored checkpoint without printing its token. For a new interactive host sample, open `https://localhost:5180/?story=red-kite`. The room link printed by the script is a read-only viewer link.

To rebuild and validate the original models:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/red-kite/build_assets.py
node tools/red-kite/validate_assets.mjs
```

For Khronos validation, install the pinned validator in the ignored tools folder and use its documented `validateBytes` API; the full resulting report is committed. No paid-provider tests are required for an asset refinement.

## What comes next

Use [TEAM_HANDOFF.md](TEAM_HANDOFF.md) for parallel assignments and exact files.

1. **Physical Quest 3 acceptance:** caption size, seated/standing reach, both views and head movement, hardware trigger/squeeze, hand pinch if desired, rest/leave and sustained frame timing. Choose the final 500k/100k setting from real measurements.
2. **Real two-person storytelling:** short consented clips, exact speaker-linked transcript/translation and bilingual review. Connect the existing general speech services to this source/choice boundary. The current Red Kite route is fixture-driven; arbitrary live narration does not yet build this scene.
3. **Art and sound refinement:** refine the existing paper/wood/ribbon rather than rebuild the architecture; add restrained spatial ambience, align transitions to real audio and rehearse a quiet keepsake ending. Keep it comfortable and clear before adding people or locomotion.
4. **Participant feedback:** evaluate a person-led reminiscence session with an appropriate family partner. Younger-onset Alzheimer's is the intended context; this prototype has no established clinical efficacy.

No new World Labs generation is authorized by this evaluation. Its existing local count remains five of five.
