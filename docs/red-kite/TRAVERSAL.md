# Walking through The Red Kite

The existing Gate stack is the game engine for this scene: Three.js and Spark draw the World Labs world, React Three XR/WebXR provide headset tracking and controller events, and Rapier resolves the player's movement against World Labs' actual collision mesh. A Unity rewrite is not required for this browser-based architecture. The two perspectives are starting points in one continuous place; visitors may walk freely between and beyond them wherever the exported ground supports them.

## Controls

| Device | Explore | Story and recovery |
| --- | --- | --- |
| Desktop | Click the world, drag to look, WASD/arrows walk, Shift runs, Space jumps. Optional Mouse free look under Scene controls; Esc releases it. | R or Return to the story resets the grounded starting point behind a scene-space fade. Hide panels leaves more scenery visible. |
| Touch | Hold the movement pad; drag the meadow to look. Releasing/canceling the touch stops movement. | Scene controls includes Return to the story. Story controls stay outside the movement pad. |
| Quest | Left stick walks relative to the tracked head; right stick snap-turns 30 degrees. Release the right stick to rearm. Physical head tracking remains native. | Left-stick press returns; X switches telling; A advances for authors; B rests; Y exits. Native ray buttons provide alternatives, including exit while resting. |

The spool supports pointer/ray capture and nearby squeeze grabbing. Walking does not freeze while holding it. Rest releases it and stops animation; the rest control remains available. Story choice permissions remain server-enforced. Merely walking or choosing a local perspective never confirms a story detail or moves another viewer.

## One coordinate frame

The cached visual source and collider belong to world `0b84554c-b182-4b3e-a7bb-78f15822a49d`. Both use the same X-axis half-turn from the provider's OpenCV frame, scale `2.6397884` and source eye translation. The controller samples the actual entrance floor, calculates a vertical correction of approximately `1.146 m`, and applies it to both scenery and collision. Props remain at the shared floor/table coordinates.

Elena starts at `[0, 0, 0.25]`; Rosa starts at `[0.85, 0, -4]`. The controller samples each point's real ground height. Rosa's clearer path position replaced an earlier point amid close foliage. Starting points live in `apps/gate/src/red-kite/viewpoints.ts`; the shared social scene imports that same definition. Avoid moving a camera independently of its feet or applying a transform only to the visible splats.

## Physics and boundaries

`traversal.ts` owns a Rapier 0.21.0 kinematic capsule and the 51,610-triangle static environment. It resolves desired horizontal movement with sliding, gravity, 45-degree climb limit, 28 cm autostep and ground snapping. Desktop jump starts at 3.8 m/s. Frame delta is bounded and physics substeps are no longer than 1/90 second. The separate folding table has an authored box collider.

Missing or overly steep ground at the generated export's edge blocks the next horizontal step. A last-safe grounded position recovers a fall beyond the available geometry. There is no infinite proxy plane, small story radius or teleport-only restriction. Rest/disconnection blocks locomotion; the existing opaque 3D mask covers viewpoint/return repositioning in both eyes. A malformed mesh fails visibly with Retry scene rather than pretending the world is ready.

This is a locomotion capsule, not a physical body avatar. The wearer can still physically lean through a surface; track play-space safety and comfort on hardware. A coarse generated collider may approximate foliage or miss fine visual objects. The kite/spool use critically damped tether springs, a dynamic string curve, ribbon motion and an animated box hinge. They are not full cloth/string rigid-body simulation, and scenery splats are not individually movable game objects.

## Visual detail and performance

The default loads the original 1,920,000-splat, 30.8 MB source and enables Spark's view-dependent LoD. Render targets are 1.2M on desktop, 600k for coarse-pointer devices and 500k in XR. These are target counts, not measured FPS. Spark builds LoD on load. Static 500k and 100k modes are selectable alternatives; all share the same calibration and collider. Lower visual quality must never disable walking.

The generated world has finite detail and can blur or streak close to surfaces. High-resolution source detail helps but does not turn reconstruction artifacts into hand-authored geometry. On Quest, measure source download, initialization, memory and sustained frame timing, then choose the best quality option. The production bundle still reports large chunks, including the embedded Rapier compatibility runtime. Browser or IWER success is not a hardware performance result.

Readiness requires the first visible sorted splats, not merely successful SPZ parsing. First-use native text controls have their own Suspense boundary so entering VR cannot suspend and rebuild the loaded meadow. The XR regression checks the same mesh instance and a nonzero scenery render across entry, in addition to controller behavior.

## Source map

| File | Responsibility |
| --- | --- |
| `apps/gate/src/red-kite/traversal.ts` | Render-independent Rapier capsule, ground, wall/slope/edge behavior and recovery. |
| `apps/gate/src/red-kite/Terrain.tsx` | Bake GLB transforms, initialize/clean up physics, expose optional wireframe. |
| `apps/gate/src/red-kite/navigation.ts` | Pure input intent, head-relative displacement and snap-turn latch. |
| `apps/gate/src/red-kite/StoryScene.tsx` | Keyboard/drag input, resolved camera/XR origin, head-centered snap, native controls and scene mask. |
| `apps/gate/src/red-kite/TouchPad.tsx` | Captured touch movement with release/cancel cleanup. |
| `apps/gate/src/red-kite/Meadow.tsx` | Static or adaptive Spark rendering, shared spatial correction and disposal. |
| `apps/gate/src/red-kite/Experience.tsx` | Readiness/errors, preferences, quality controls, pause and story integration. |
| `fixtures/worlds/red-kite.json` | Existing world identity plus source/collider paths, sizes and SHA-256 hashes. |

## Verification and remaining work

Run `npm run test:red-kite` after `npm run demo:kite` with local Convex/Gate up. It validates the original props, verifies the full-source/collider hashes, walks a route of more than 30 m through the actual mesh, runs 13 core browser checks, four targeted traversal/quality/touch/failure checks and ten emulated Quest checks. Run `npm test`, `npm run test:headset`, root/Gate typechecks and Gate build for the surrounding regression set. Reports and actual renders are committed under `evidence/red-kite/`. Keep the ignored room checkpoint private.

Remaining acceptance work is physical Quest comfort/performance, reach and real input; real consented family audio and bilingual transcript review; and scenery/art/audio refinement along the chosen demo route. This route still uses fictional source lines and a labeled computer sample voice. It does not yet construct arbitrary live stories from speech. No clinical benefit is established. No new World Labs generation was submitted for traversal: both new cache files were outputs of the already approved world.

Primary references: [World Labs interactive examples](https://docs.worldlabs.ai/api/interactive-world-examples), [export frame](https://docs.worldlabs.ai/marble/export/specs), [SPZ rendering](https://docs.worldlabs.ai/api/rendering-spz), [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/), [Spark mesh LoD](https://sparkjs.dev/docs/splat-mesh/) and [render budgets](https://sparkjs.dev/docs/spark-renderer/).
