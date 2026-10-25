# The Red Kite: evaluation and remaining work

Evaluated October 24, 2026. The two-perspective fictional demo is implemented in the actual Gate app. This record distinguishes real browser/stereo evidence from physical-headset and live-family work that still needs evaluation.

## What is implemented

| Deliverable | Current result |
| --- | --- |
| Actual app entry | The Gate portal links to `?story=red-kite`. It creates/reopens a browser-owned fictional sample or joins a room as a viewer. Cached-world setup is recoverable; a paused story reopens without unpausing. |
| One continuous World Labs meadow | The previously approved Marble 1.1 world is cached. No additional generation was submitted. Both viewpoints and their peripheral surroundings were checked in Gate. |
| Free exploration | A Rapier kinematic capsule walks against the actual 51,610-triangle World Labs collider. Keyboard, touch and Quest stick input share gravity, ground following, slope limits and obstacle collision. There is no radius around a story anchor. Missing ground at the finite export edge blocks further walking. Desktop also supports running and jumping. |
| Two personal and spatial perspectives | Elena looks along the path; Rosa looks back across the clearing from the oak side. Selection stays local to each viewer and never accepts a detail or moves another participant. |
| Separate sources and choices | Eight attributed fictional source records, per-telling revisions/playheads and explicit Use / Leave decisions. Unknown color never borrows from the other telling. Elena's red and Rosa's orange remain separately source-linked. |
| Five original Blender props | Paper kite with frame/bridle/ribbon, wound wooden spool, folding support table, hinged keepsake box and story card. Editable source, reproducible builder, embedded small textures and actual GLBs are committed. |
| Interactive scene | Dynamic string uses the actual exported string anchors. Desktop pointer capture, native controller ray input and a nearby squeeze grab lift and release the spool. Critically damped springs drive spool return and kite lift from actual vertical spool travel; grabbing alone does not raise it. Walking remains available while holding it. A breeze button provides an alternative. |
| Voluntary viewpoint transition | Scene-space opaque mask, release/dock, grounded starting-point change, fade-in. The same covered transition returns an exploring visitor to their current telling. Head tracking stays active. Rest/disconnect cancels a pending transition without an uncovered origin jump. |
| Rest and reduced motion | Rest stops sample speech and procedural motion, safely releases capture and gates story writes. Browser reduced-motion preference freezes the idle kite/ribbon clock while retaining bounded explicit interaction. Preference changes during the visit are observed. |
| Quieter interface | Smaller translucent story and perspective panels leave more of the world visible. Hide panels, explicit ambient-motion control, three scenery quality options and a collision-surface inspector are available. Native Quest controls are smaller and have separate return and exit actions. |
| Source and keepsake presentation | Exact source text, separate comparison cards, an interactive box and an in-world comparison summary. Sample playback is labeled as a computer voice. No original family recording is attached. |
| Sharing and recovery | Read-only room links omit author tokens. Two browser contexts keep independent perspectives while receiving shared choices. Reconnect preserves decisions; the saved local viewpoint survives reload. |

## Actual spatial review

The generated result differs from the reference: it has a large nearby oak on the left and a smaller oak farther down the path. The implementation uses that actual geometry. The prop support stays at one shared world position; it does not move to follow a camera switch.

Elena starts at `[0, 0, 0.25]`; Rosa starts at `[0.85, 0, -4]`, in meters, with feet grounded on the mesh. Rosa's former oak-side point was inside close foliage at walking height; actual exploration found the clearer path position now used. These are starting/return points, not movement limits. Provider scale is 2.6397884, with an inferred source eye height about 1.525 m. The collider and visual world receive the same OpenCV-to-Three.js transform and approximately 1.146 m vertical correction so the real entrance floor, character and prop support agree. The World Labs camera far plane remains 1,000 m, preserving distant hills/sky.

Actual Gate captures, not concept art:

- [Elena with her chosen red kite](../../evidence/red-kite/03-elena-red.png)
- [Rosa with her chosen orange kite](../../evidence/red-kite/04-rosa-orange.png)
- [Both source-linked tellings](../../evidence/red-kite/05-both-tellings.png)
- [Emulated stereo from Elena](../../evidence/red-kite/07-xr-elena.png)
- [Emulated stereo from Rosa](../../evidence/red-kite/08-xr-rosa.png)
- [Rosa looking left](../../evidence/red-kite/09-xr-rosa-left.png)
- [Rosa looking right](../../evidence/red-kite/09-xr-rosa-right.png)
- [Desktop exploration](../../evidence/red-kite/10-desktop-exploring.png)
- [Touch traversal](../../evidence/red-kite/11-mobile-touch.png)
- [Panels hidden](../../evidence/red-kite/12-quiet-panels.png)

The default now uses the existing **1,920,000-splat source** with Spark's view-dependent level of detail: target budgets are 1.2M desktop, 600k coarse-pointer and 500k immersive XR. A target is not a measured frame rate or a claim that exactly that many splats draw each frame. Static 500k and 100k exports remain explicit alternatives under Scene controls. The full source is about 30.8 MB and builds its LoD on load; startup/network/memory tradeoffs still need hardware measurement. The 100k version is visibly coarser. Spark uses its standard wider Gaussian kernel coverage. Generated scenery can still have blur, streaks or holes near surfaces; a collision mesh does not recreate missing visual detail. Physical scale, seated reach and sustained frame timing still need Quest evaluation.

The source scene is a fictional AI interpretation. The application does not turn differences between speakers into a truth score or a visualization of a person's brain.

## Verification

- 110 smoke tests cover existing server behavior plus independent narrator choices, source ownership, stale/repeat commands, viewer restrictions, pause, cleanup, transition timing, spring/lift response, reduced motion, input intent, real Rapier wall/slope/jump/edge behavior and bootstrap recovery.
- 12 existing headset regression tests pass.
- Root and Gate TypeScript checks and the Gate production build pass in this traversal pass. The fallback client was not changed or rebuilt in this pass. Large-bundle warnings remain; they are not physical performance measurements.
- Thirteen core actual-browser checks pass with no page errors. They exercise the real UI, walking/look/jump/return, unknown/declined/accepted choices, two sessions, source display, pointer capture/lift while walking, switching while holding, panel/motion options, pause/reload, reconnect, mobile rest and actual scene stability under reduced motion.
- Four additional actual-browser checks pass with no page errors: held running survives look-drag release; all three quality modes render and retain real walking; a malformed collision export remains an actionable error after the visual meadow loads; real touch input walks on the mesh and stops on release, with no horizontal mobile overflow.
- Ten IWER checks pass with no page errors: immersive entry/frame advancement, left-stick walking/right-stick snap turning/return, masked local switch, A/trigger authoring, tracked head turns, ray and squeeze lift/release, B rest, read-only viewer pause protection, native exit while resting and Y exit after reentry. Stereo uses a 64 mm IPD. The harness disables only the emulator's manual pose/gizmo updater so emulated tracked poses can drive the actual XR event path.
- Screenshot inspection caught a separate VR-entry render regression that controller-only checks missed. First-use native text suspension rebuilt the meadow; parsing could also report ready before the first visible sort. A local native-controls Suspense boundary now preserves the loaded mesh, and readiness requires a visible sorted scenery result. The entry check asserts both a nonzero rendered world and unchanged mesh instance across VR entry.
- A separate production-controller check traverses more than 30 m through five waypoints on the actual cached mesh, including both story areas. Its report records the world ID, collider hash, vertical correction, route and grounded positions. It does not certify every triangle in the export.
- All five GLBs pass Khronos glTF Validator 2.0.0-dev.3.10 with **zero errors and zero warnings**. The independent export check verifies hashes, one scene per GLB, required anchors, plausible meter scale and actual index-based triangle counts.
- Total exported models: **406,892 bytes and 5,612 triangles**. The source Blender file is also committed.
- The browser speech test invokes the real browser API, and deliberately injects one late callback to check cancellation. Audible quality and family speech are not measured by that test.
- The earlier story review's reduced-motion and spool-height regressions remain. An independent traversal source review found three P2 issues, now fixed and covered by browser regression: releasing look-drag cleared held movement keys; the native exit label performed return instead; visual success could erase a terrain failure. Follow-up source review found no blocking issue. The reviewer did not independently rerun hardware tests.

Reports: [core browser](../../evidence/red-kite/browser-report.json), [traversal browser](../../evidence/red-kite/traversal-browser-report.json), [actual mesh route](../../evidence/red-kite/traversal-report.json), [XR](../../evidence/red-kite/xr-report.json), [glTF](../../evidence/red-kite/gltf-validation.json). Architecture and controls: [TRAVERSAL.md](TRAVERSAL.md).

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

1. **Physical Quest 3 acceptance:** walking/snap turning, caption size, seated/standing reach, both views and head movement, hardware trigger/squeeze, hand pinch if desired, rest/leave and sustained frame timing. Choose adaptive/500k/100k from real measurements. A character capsule constrains stick locomotion; it does not prevent physical leaning through virtual surfaces.
2. **Real two-person storytelling:** short consented clips, exact speaker-linked transcript/translation and bilingual review. Connect the existing general speech services to this source/choice boundary. The current Red Kite route is fixture-driven; arbitrary live narration does not yet build this scene.
3. **Art and sound refinement:** refine the existing paper/wood/ribbon, inspect close-up scenery along a rehearsed walking route, add restrained spatial ambience, align transitions to real audio and rehearse a quiet keepsake ending. The generated meadow remains scenery; only the separate props are semantic, animated objects. No full cloth, string rigid-body chain or destructible environment is implemented.
4. **Participant feedback:** evaluate a person-led reminiscence session with an appropriate family partner. Younger-onset Alzheimer's is the intended context; this prototype has no established clinical efficacy.

No new World Labs generation is authorized by this evaluation. Its existing local count remains five of five.
