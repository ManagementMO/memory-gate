# Teammate build brief: The Red Kite

Give this file to the teammate and their Claude Code or Codex agent. It is a concrete build assignment, not a request to invent another architecture. Work in your own clone or agreed branch so you do not overwrite the integration owner's active changes.

## Copy-and-paste starter prompt

> Build the Red Kite asset and interaction package described in `docs/red-kite/TEAMMATE_ASSET_BRIEF.md`. Read that entire file, `docs/red-kite/SCENE_DIRECTION.md`, the scoped repository instructions and the existing loader/interaction code before editing. You own original Blender models, their reproducible build script, validated GLB exports, a manifest, a small framework-independent behavior core, one isolated adapter for the selected client and a preview. The new `apps/gate` client is the preferred journey integration target; `apps/headset` is the currently verified World Labs rendering fallback. Do not mix their Three runtimes. Preserve the existing app and backend; do not edit their shared integration files without coordinating with the integration owner. Work on `codex/red-kite-assets`. Make the kite and spool beautiful and usable before adding optional scenery. Use Blender's Python API to build and refine reproducibly; an MCP connection is optional. Run focused validation, load the actual exports in a browser, inspect context renders, test real input where available and distinguish desktop/emulated evidence from physical Quest evidence. Deliver source, exports, code, screenshots and a concise handoff with actual budgets, commands, limitations and commit. Continue with useful local work if an optional service is unavailable. No paid generation or external publishing is authorized by this asset assignment.

The repository is `ManagementMO/memory-gate`. The World Labs rendering checks began from `12d838d`. During delivery, the team's newer Gate work arrived through `5ba599f`; it is preserved in the merge. Inspect your current checkout. Do not use the old repository.

## Two clients: choose the adapter deliberately

The repository now has two independent browser clients sharing backend services:

| Client | Actual inspected stack | Integration use |
| --- | --- | --- |
| `apps/gate` | React 19.3, React Three Fiber 9.8, `@react-three/xr` 6.6.31, Three 0.186.1, Spark 2.4 | Preferred place for the team's new portal, companion, album and shared-presence journey. Build a small React/R3F adapter here for the finished story. |
| `apps/headset` | IWSDK 1.0.1, Spark 2.4, Three alias `super-three@0.181.0` | Existing shared-story runtime in which this meadow was actually rendered and its clipping corrected. Keep it as a verified fallback. |

The GLBs, named anchors, dimensions, material semantics and pure animation/state math should work in either client. **Do not import IWSDK components into the Gate bundle or pass Three objects between these two client runtimes.** Build one native adapter for the selected target first, not two complete apps. The detailed IWSDK examples below apply only to the fallback adapter; they are not APIs for React Three XR.

For the preferred Gate adapter, read `apps/gate/src/scene/PhotoWorld.tsx`, `World.tsx`, `SceneCanvas.tsx`, `XrLayer.tsx`, `scene/xr.ts`, `flow/memory.ts` and `state/store.ts`. Reuse its existing Canvas, XR store, frame loop, room session and pause/rest lifecycle. Use current documentation matching the pinned React Three XR version for handles/grabbing. Do not create a second Canvas/XR session or a new multiplayer service. Keep the existing companion, portal and album intact.

The actual meadow contains forward splat centers beyond 267 m. Both clients now use the shared 1,000 m World Labs far-plane policy; Gate's PhotoWorld restores its previous range when the source leaves. During integration, ensure the portal's white-space/sky transition steps aside for the opaque generated setting. This new meadow has **not** been visually validated in Gate by this package; the existing evidence is from IWSDK.

## The outcome

We want a shared childhood afternoon to feel tangible through **two people's perspectives** in a calm California meadow. Elena remembers the kite pulling at the spool from the open path; Rosa remembers the ribbon and Elena's laughter from beside the oak. The **kite and its wooden spool** connect their tellings. A visitor can choose a telling, listen to its source and gently interact with the shared object. A keepsake box and source cards preserve both accounts.

## Core requirement: perspectives are personal and spatial

The user clarified that exploring a memory from different people's perspectives is the central product idea. Build for two attributed tellings of one scene, not a single storyteller with interchangeable camera angles.

- Preserve a stable shared object ID and common world-space landmarks. Each contributor's appearance, remembered placement, words, uncertainty and illustration choice remain separately attributed. An agreed staging choice is not proof that two accounts agree historically.
- The selected telling is local to the viewer. Do not move other participants, change canonical story content or confirm a proposal when someone switches perspectives.
- Support a host-provided path viewpoint and oak-side viewpoint. Deliver assets with finished reverse faces, sensible normals and materials from both sides. Do not optimize only the hero camera. The integration owner calibrates the anchors against the actual generated world; their coordinates are not inferred from the concept image.
- Emit a perspective-selection intent to the host, which owns a voluntary fade → stationary-origin change → fade transition. Keep head tracking intact. Release/dock held props before the transition, and preserve their shared world-space anchors. If a seated visitor needs a reachable inspection copy, label and manage it as local inspection rather than moving the remembered object.
- Elena's and Rosa's accounts may be complementary or contradictory. Keep red-versus-orange alternatives source-linked; never overwrite the other person's detail or let the AI decide which memory is true. Unknown in one telling does not inherit a value from another without an explicit, attributed illustration choice.
- A present-day relative who was not at the event contributes an interpretation or response, not an eyewitness memory. No reconstructed child/avatar is required for P0.

The existing 2D rehearsal shows only Elena's illustration sequence. It does not establish multiple perspectives or a reverse-view 3D pass. The full fictional dialogue and both viewpoints are specified in `SCENE_DIRECTION.md`.

We are building for Meta Quest 3 in the existing web application. This is a stationary, seated-compatible shared reminiscence experience. The meadow stays stable. There is no forced locomotion, child avatar, memory quiz or claim that adding a visual detail restores a person's memory.

Reference images in this directory:

- `references/meadow-reference-v2.png`: empty surroundings, composition and lighting reference; this is the source submitted to World Labs.
- `references/completed-scene-concept.png`: proposed final-state look with props. This is art direction, not a rendered product screenshot. Do not bake its props into a panorama.

## Tools to use

| Tool | Use | Constraint |
| --- | --- | --- |
| Blender + `bpy` | Model, UV, shade, create pivots/optional clips, export original assets and save editable sources. | Primary path. Keep the build reproducible. |
| Blender MCP | Inspect an open scene, execute small refinements and capture visual checks. | Optional third-party bridge. Do not block local work on it. Inspect an existing scene before changing it. |
| Selected client's pinned XR framework and Three | Build one isolated native-interaction adapter and preview. | Gate uses React Three XR; the fallback uses IWSDK. Keep them separate. |
| Existing GLTFLoader | Test the actual exports, materials, bounds, animations and named parts. | A Blender viewport render alone is insufficient. |
| Khronos glTF Validator | Catch invalid GLB data and review portability warnings. | Zero errors; account for warnings. It cannot judge visual quality. |
| Browser automation / IWSDK tools | Exercise the preview with real input events and capture evidence. | Do not count a debug state mutation as a successful grab. |

Blender 5.2.2 LTS was found on the integration owner's Mac at `/Applications/Blender.app/Contents/MacOS/Blender`. Detect your own installation and version. The Blender MCP health check on that computer could not connect to localhost:9876; it was not a working connection at the time of the check. A headless `bpy` script is sufficient to continue.

The community bridge is [mcp-for-blender](https://github.com/ahujasid/mcp-for-blender), formerly blender-mcp. Follow the upstream instructions matching your client if you choose to use it. It is not a reason to modify global agent settings, install unrelated plugins or alter someone else's unsaved Blender scene. A new background process with `--factory-startup` is safe for a dedicated build; clearing the active GUI scene through MCP is not.

Portable build shape:

```sh
"/path/to/blender" --background --factory-startup \
  --python tools/red-kite/build_assets.py -- \
  --output apps/headset/public/red-kite/models \
  --source assets/red-kite/source \
  --evidence evidence/red-kite-assets
```

Make these arguments real in your script. Detect supported exporter options from the installed Blender operator rather than copying options for a different release. Use only exported glTF features that the application's loader can actually consume.

## Read the existing integration first

From the repository root, inspect:

1. `apps/headset/src/AGENTS.md` and any other instructions in your chosen paths.
2. The selected client's package file and lockfile. `apps/headset` pins IWSDK and its compatible Three alias; `apps/gate` pins its own React Three stack. Do not install a second incompatible Three runtime or upgrade either stack as part of this assignment.
3. `apps/headset/src/objects.ts`: GLTFLoader cache, clones, normalization and object reconciliation.
4. `apps/headset/src/look/memoryObject.ts`: proposed/confirmed display, placement, inspection and disposal.
5. `apps/headset/src/keepsakes.ts`: working photograph proximity squeeze and release handling.
6. `apps/headset/src/app.ts`: input ownership, push-to-talk, pause and frame update ordering. Read; do not edit this shared integration file in your isolated asset branch without agreement.
7. `scripts/build-builtin-assets.mjs`, `fixtures/builtin/manifest.json` if present, and `convex/admin.ts`: export and library metadata conventions.
8. `packages/shared/src/contract.ts`: current allowed nouns and proposal semantics. Kite/spool/color/ribbon support is a separate integration task, not permission to bypass validation.

**Critical existing behavior:** in the IWSDK fallback, `Keepsakes.attach` opts in photographs only. In either client, a GLB named “spool” does not become grabbable automatically. The adapter must explicitly bind the selected client's native interaction layer, and the integration owner must mount that adapter.

**Critical deployment behavior:** `scripts/seed-builtin.mjs` without `--live` disables global live service flags. Do not run it blindly in a shared environment. Deliver a new isolated manifest and seeding instructions; let the integration owner perform any live library mutation. Do not read or copy API keys.

## File ownership and delivery layout

Create and own these paths, adapting only when an existing repository convention requires it:

```text
tools/red-kite/
  build_assets.py              # reproducible Blender build/export
  validate_assets.mjs          # bounds/nodes/triangle/material/export checks
assets/red-kite/source/
  red-kite-assets.blend        # editable original source; packed textures
apps/gate/public/red-kite/      # or the selected client's public directory
  models/kite.glb
  models/spool.glb
  models/keepsake-box.glb
  models/story-card.glb
  models/side-table.glb
  textures/                   # only if exports are intentionally not embedded
  manifest.json
apps/gate/src/red-kite/        # IWSDK fallback alternative: apps/headset/src/red-kite/
  runtime.tsx                 # selected-client adapter; no direct backend mutation
  simulation.ts               # pure state/math; no framework or renderer imports
  state.ts                    # public state and lifecycle types
  preview.ts                  # independent integration harness
evidence/red-kite-assets/
  validation.json
  browser-load.json
  views/                      # real exported-asset screenshots
docs/red-kite/
  ASSET_DELIVERY.md            # your concise results and integration handoff
```

Use a separate preview HTML entry or a dev-only path without taking over the app's main entry point. The Blender script's `--output` argument chooses the selected client's public directory; the CLI example above shows the verified IWSDK fallback path. Do not edit shared `app.ts`, Gate `World.tsx`/flow/store modules, the backend, room permissions, generation budget, service launchers, lockfiles or existing assets unless the integration owner agrees. Do not commit `node_modules`, caches, credentials, private family media, room tokens or provider upload URLs. If editable `.blend` output is large, report its size and agree on an artifact location rather than silently committing a huge file or rewriting Git history.

## Art direction and material rules

The objects are modest, handmade and cared for. They belong to an ordinary childhood afternoon, not a museum of fantasy artifacts. Avoid neon red, thick black outlines, glossy plastic, pristine machined wood and deliberately distressed grunge everywhere.

- Paper: warm matte fibers, slight irregularity at edges, readable thinness, red only in the chosen illustration state.
- Bamboo: thin pale spars, believable joinery and bridle. Do not make a heavy wooden diamond frame.
- Ribbon: cream cloth with a soft, lightly wrinkled finish and restrained thickness. No complex realtime cloth requirement.
- Spool / box: warm wood, subtle grain direction following each part, softened edges, tactile wear at contact points.
- Table: small, quiet support object. It should recede into the scene and leave the path clear.

Light and shadow must match the reference's warm upper-left sun. Use a context render as well as a neutral studio render. The object must still read under ordinary runtime lighting; a perfect offline beauty render that exports as a flat gray mesh fails the assignment.

Use core glTF PBR: base color, roughness, metalness where appropriate, optional baked normal/AO. Bake procedural Blender textures you rely on. Blender-only shader nodes, material keyframes, live cloth caches and render-engine features will not magically work in GLTFLoader. Prefer opaque surfaces; two-sided paper or ribbon may be justified after testing. Avoid unnecessary transmission, heavy transparency and per-object realtime shadows.

Default textures should be at most 1K; use 2K only when an actual close-view inspection shows a need. Share wood textures and UV atlases where useful. Respect color space: base color is color; roughness, metalness, normal and AO are data. Include all files or embed them in GLB. No missing absolute texture paths.

## Asset specifications

These are starting art and engineering budgets, **not measured Quest performance guarantees**. Report actual exported values. One polished asset is more valuable than many unfinished objects.

| Priority | Asset | Rest-pose dimensions / target | Initial budget |
| --- | --- | --- | --- |
| P0 | Kite + frame + bridle + ribbon | Sail ~0.68 m wide × 0.86 m tall; ribbon ~0.9–1.1 m below it. Report full bounds separately. | ≤18k triangles, ≤4 materials, aim ≤2 MB GLB. |
| P0 | Wooden hand spool | ~0.18 m wide; grip diameter ~0.035–0.04 m. Comfortable adult-scale silhouette. | ≤6k triangles, ≤2 materials, aim ≤0.75 MB. |
| P0 | Small side table | Top ~0.65 × 0.45 m, top height ~0.75 m. | ≤10k triangles, ≤2 materials, aim ≤1 MB. |
| P1 | Keepsake box | ~0.26 × 0.18 × 0.09 m, articulated lid. | ≤12k triangles, ≤3 materials, aim ≤1 MB. |
| P1 | Story card | ~0.15 × 0.10 m, minimal thickness. | ≤1k triangles, replaceable front material, aim ≤0.3 MB. |
| P2 | Sparse grass / poppy patches | Correct scale against the near meadow; no giant flowers. | Small shared meshes and materials, instanced; measure alpha overdraw. |

The main integration direction includes the box/card, but complete the kite/spool interaction before spending time on them. The near clearing is a design reference, not a measured floor from World Labs. Final object locations must be calibrated against the generated world's actual scale and the user's reachable space.

### Kite hierarchy and behavior

Use stable descriptive names. The exact hierarchy can differ if documented, but provide these semantic anchors:

```text
KiteRoot
  KiteSail                   material: KitePaper
  KiteFrame
  BridleAnchor               empty / transform node
  StringAnchor               empty / transform node
  TailRoot
    Tail_00
      Tail_01
        ...                  small transform chain or documented ribbon rig
```

Default `KitePaper` should be neutral warm ivory. Runtime code can color an instance red after illustration acceptance. Cream ribbon color is also an accepted detail, not an automatic factual inference. For a proposed illustration, use the app's proposal treatment or the adapter's clearly defined equivalent.

Do not export a string mesh stretching all the way to a fixed world position. The runtime should own a lightweight dynamic line connecting the kite anchor to the spool's `StringExit` node. The string's physical appearance must remain visible enough in headset; an arbitrarily thin one-pixel desktop line may disappear in stereo.

Give the sail a slight physical bow and fine frame thickness so it is not just a featureless plane. Keep the total asset coherent from the front, side and below. Avoid extreme tail animation crossing the viewer's face. A short loop or procedural rig is acceptable; retain a stable rest pose.

### Spool hierarchy and grabbing

```text
SpoolRoot                    documented grip / attachment origin
  SpoolBody
  WoundString
  StringExit                 transform at actual string exit
```

The hand should meet the grip, not the far edge of a bounding box. Use a simple grip/collider proxy suited to native proximity selection. Verify the geometry and attach transform in the runtime. Native squeeze is the P0 input; optional hand pinch must be verified against the installed IWSDK, not inferred from newer online examples.

A local held pose is transient. Do not write it into the canonical remembered placement on every frame. Release returns the spool smoothly to its dock. Pause safely releases/docks it. Reconnect must not produce a duplicate object or a false new confirmed story revision.

### Keepsake box and card

```text
KeepsakeRoot
  BoxBase
  LidPivot                   real hinge origin, not center of lid
    BoxLid
  StoryCardDock
```

Optional exported clips: `BoxOpen` and `BoxClose`, about 0.9 seconds each. Keep animation to exported translation/rotation/scale or a supported rig. Check hinge motion in GLTFLoader after export. No lid penetrating the box. A real separate card has a named `StorySurface` material that can receive a runtime texture or layout.

The card carries source words and a chosen illustration. Do not invent a childhood photograph, a face, a date, a diagnosis or a handwriting sample and pass it off as family evidence. Any sample text or thumbnail must be explicitly fictional in the preview. Real audio playback belongs to the integration owner's source system and consent checks.

## Export contract

- Units are meters. Apply unwanted scale and rotation before export.
- glTF output is Y up. Model's meaningful front faces +Z as expected by the library. Record any `yawOffset` instead of hiding arbitrary rotations in several parents.
- Keep a single semantic asset root and only relevant descendants. No cameras, lights, ground plane, studio backdrop or unrelated collections in the GLB.
- Root origin and pivots are intentional. Table bottom can rest at y=0; spool grip and kite rig roots need their own documented conventions.
- Record visual mesh bounds excluding helper empties, colliders and debug geometry. Record collider bounds separately.
- **The IWSDK library's `size` is the largest rest-pose dimension**, not width and not the desired kite sail height. That loader normalizes to this value. A long ribbon changes the bound. Include both `librarySize` and `sailDimensionsMeters`. Gate should load the meter-scaled asset directly unless its own adapter explicitly needs normalization; do not apply both scaling conventions twice.
- Avoid negative-scale surprises, inverted normals, duplicate faces, unnecessary hidden geometry and implausibly thick paper.
- Use unique named nodes for behavior. Preserve names through export and assert their presence during validation.
- Verify animation clips and node transforms by re-importing the actual GLB, not just inspecting the `.blend` scene.
- If a runtime clone changes color, clone its material first. Existing loader clones can share materials and geometry. Disposing or recoloring a shared resource must not break other instances.
- For any skinned ribbon, use the appropriate skeleton-aware cloning path and test two simultaneous instances. If unnecessary, choose simple transform segments to keep integration easier.

Suggested manifest shape; generate actual measurements rather than copying placeholders:

```json
{
  "schema": "memory-gate.red-kite-assets/1",
  "units": "meters",
  "front": "+Z",
  "assets": [{
    "key": "red-kite.kite",
    "file": "models/kite.glb",
    "sha256": "GENERATED_FROM_EXPORTED_BYTES",
    "bytes": 0,
    "triangles": 0,
    "materialCount": 0,
    "boundsMeters": {"min": [0, 0, 0], "max": [0, 0, 0]},
    "librarySize": 0,
    "sailDimensionsMeters": [0.68, 0.86],
    "yawOffset": 0,
    "requiredNodes": ["KiteRoot", "KiteSail", "StringAnchor", "TailRoot"],
    "clips": [],
    "source": "Original project-authored Blender asset",
    "license": "Project-owned; see source and contributor attribution"
  }]
}
```

Do not register namespaced asset keys blindly as story nouns. Library key mapping and the backend's allowed vocabulary are the integration owner's responsibility. Supply recommended nouns/synonyms without bypassing the contract.

## Isolated runtime adapter

Deliver a small module the integration owner can mount under the existing memory root. Keep network and story authorization outside it. Use the selected client's native XR interaction layer. Reuse that client's Three objects and frame loop rather than starting another XR session or renderer. In Gate, a React component can own the adapter and call the pure simulation from `useFrame`; in IWSDK, the host calls the adapter's update method.

Illustrative public contract:

```ts
type IllustrationDetail = {
  value: string | null;
  status: 'unknown' | 'proposed' | 'accepted';
  sourceUtteranceId: string | null;
  contributorId: string | null;
};

type RedKiteState = {
  revision: number;
  perspectiveId: string; // this viewer's selected telling; never a forced room-wide camera selection
  identity: 'absent' | 'proposed' | 'accepted';
  identitySourceUtteranceId: string | null;
  color: IllustrationDetail;
  ribbon: IllustrationDetail;
  paused: boolean;
  reducedMotion: boolean;
};

// Adapt host types to ONE selected client after inspecting its pinned version.
const scene = mountRedKite(host, memoryRoot, {
  assets,
  onReplaySource: (sourceId) => hostReplay(sourceId),
  onError: (error) => hostReport(error),
});
scene.applyState(authoritativeIllustrationState);
scene.update(deltaSeconds);
scene.snapshot();
scene.dispose();
```

If the adapter offers a “use this look” control, it emits a proposal ID / intent callback to the host. It must not locally mark a story detail accepted and later assume the database agreed. The preview can use a clearly labeled synthetic host for demonstration.

`applyState` receives a projection of authoritative content for this viewer's selected perspective; the underlying store keeps all contributors' accounts. Source/proposal references must be validated against the correct room and contributor. Do not persist one flattened “final memory” that discards alternatives. A perspective selector emits a request to the host; the adapter never writes a shared camera pose or changes another person's narrative layer.

Keep **story state** separate from **local interaction phase** (`docked`, `held`, `flying`, `returning`). Holding a spool is not a confirmation of the kite's historical color. A rejected or superseded proposal must stop affecting the visible accepted illustration. Ignore stale revisions; handle a new authoritative reset cleanly.

### Motion implementation

Use simple stable math and a small number of nodes:

1. A base wind phase produces low-amplitude kite sway and ribbon lag.
2. The spool's lift above its dock, clamped to a short comfortable range, changes a target kite height by a modest amount. Exponential smoothing or a damped spring follows that target.
3. A short tail chain follows the motion with decreasing amplitude. No heavy cloth solver is required.
4. A dynamic string buffer with roughly 24–40 segments connects actual anchors with a slight sag. Reuse buffers; do not allocate geometry every frame.
5. Pause freezes the simulation clock and stops audio callbacks. Release/docking must remain safe. Reduced motion minimizes travel and keeps the horizon completely fixed.

Starting layout in the visitor's local frame: visitor faces -Z; reachable support ~0.6–0.9 m ahead and slightly to the side; kite ~3–5 m ahead and ~2.6–3.3 m above the calibrated floor. These are composition guesses, not calibrated placement values. Support seated adjustment and keep controls within easy reach. The integration owner will align them to the actual World Labs floor and Quest reference space.

In the IWSDK fallback, the right trigger belongs to push-to-talk. In Gate, the scene's tap/trigger can broadcast a “look here” mark. Spool interaction must own and stop propagation of its relevant events so a grab does not also talk, replay a clip or send a mark. Preserve pause/rest and leave controls. Short-click source replay and native grabbing need an explicit ownership rule.

### Lifecycle and performance

- Load each model once per intended cache, expose meaningful load errors and never silently substitute a different artist's asset.
- Support pause during loading and disposal before loading completes.
- Release native grabs before destroying entities. Remove listeners and dispose owned resources only.
- Test mount → unmount → mount without duplicate objects, input handlers or audio.
- Keep GPU work modest: share static geometry, avoid unnecessary shadows, avoid giant alpha grass planes, and measure the real combination with SPZ.
- The SPZ 100k/500k choice and XR framebuffer scale are separate controls. The adapter must not silently change either one.
- The first physical Quest target is a stable comfortable session; choose and measure an appropriate refresh target with the integration owner. A desktop FPS count is not a headset pass.

## Preview and evaluation

Provide an isolated preview that loads the **actual exported GLBs**, with the meadow reference as context or the cached world if the host exposes it. Label a flat reference background as 2D. The existing `docs/red-kite/rehearsal.html` explains story beats; it does not test your 3D geometry or native squeeze.

The preview needs keyboard/button alternatives, reset, pause, source-word inspection and a read-only diagnostic snapshot. It must not expose credentials or require paid services. Build it so the integration owner can see the five assets, toggle neutral/proposed/accepted illustration states and exercise lift/dock without rewriting the main app.

Test these meaningful cases:

| Case | Expected evidence |
| --- | --- |
| “We had a kite. I can't remember its color.” | Identity can be proposed; red is not accepted automatically. |
| “I don't remember whether there was a kite.” | No kite is created from uncertain identity. |
| Proposed red / cream details | Proposed appearance is distinguishable; only an accepted authoritative state changes the chosen illustration. |
| Reject / supersede the proposal | No stale color or tail state survives. |
| Two kite instances | Recoloring one does not recolor the other. |
| Grab, lift, release | Actual native squeeze or clearly labeled desktop equivalent; anchors follow; return to dock works. |
| Pause while holding / animating | Safe release, frozen world motion, no queued replay after pause. |
| Reconnect / repeated applyState | No duplicate props, no false story writes, latest revision wins. |
| Switch Elena / Rosa | Same landmark/object anchors, correct source and contributor, no remote viewer's camera or story state changes. |
| Different colors or remembered placements | Each account survives the switch; a shared stage choice does not erase the alternatives. |
| Unknown detail in one account | It stays unknown in that telling; another contributor's detail is not silently borrowed. |
| Switch while holding / paused | Safe docking before a voluntary transition; no camera switch while paused, no held prop left attached to the old viewpoint. |
| Missing model / named node | Clear recoverable error; no half-working invisible collider. |
| Seated mode / reduced motion | Controls reachable, no forced camera motion, stable pose. |
| Mount / dispose twice | No leaked entities, handlers or runaway animation. |

Run the selected client's pinned typecheck/build for your code, focused tests for state/lifecycle behavior you introduce, glTF validation, and browser loading of the real exports. Do not run live paid-provider suites just to make a local asset change green. If a package is missing, use the existing lockfile and report the installation; do not upgrade the stack.

Capture at least: neutral kite, accepted red kite, close spool grip, box open, side/back view of the kite, and one context view. Identify whether each is an offline Blender render, a browser screenshot, an emulator screenshot or a physical Quest capture. A screenshot alone does not prove grabbing; supply an interaction trace or short recording with actual input events.

## Definition of done

The package is ready for integration when the actual GLBs load with all materials, agreed nodes and sensible measured dimensions; the kite and spool look convincing together; the selected client's isolated adapter exercises grab/lift/dock and pause; the source and export process are reproducible; and the handoff makes any remaining hardware or integration limits explicit.

Put these in `ASSET_DELIVERY.md`:

1. What you built, with screenshots of actual exports.
2. Exact build / validation / preview commands and tool versions.
3. Actual bytes, triangles, materials, bounds and hashes per asset.
4. Runtime API, required native components, input ownership and cleanup.
5. Required integration edits, named precisely, without making them behind the owner's back.
6. Checks passed, failed and not run; physical Quest evidence separately.
7. Source/license attribution and any third-party files.
8. Commit SHA and remaining risks in priority order.

Commit only your owned paths on `codex/red-kite-assets`. Coordinate before pushing shared branches or publishing. Never force-push or overwrite another contributor's work. If time runs short, deliver a superb kite and spool with honest evidence, then list the unfinished box/card. Do not pad the scene with crude assets to appear complete.

## Source references

- [World Labs SPZ rendering and coordinate guidance](https://docs.worldlabs.ai/api/rendering-spz)
- [IWSDK interaction guide](https://iwsdk.dev/guides/06-built-in-interactions.html): compare with the pinned installed API; the website may describe a newer version.
- [React Three XR interactions](https://pmndrs.github.io/xr/docs/tutorials/interactions) and [handles](https://pmndrs.github.io/xr/docs/handles/introduction): use the Gate client's pinned version; do not copy IWSDK components into it.
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)
- [Community Blender MCP bridge](https://github.com/ahujasid/mcp-for-blender)
- [Alzheimer's Association reminiscence guidance](https://www.alz.org/help-support/caregiving/daily-care/reminiscence-and-reminiscence-therapy)

The asset budgets, object measurements, hierarchy and motion recipe above are this project's design decisions. They are not promises from those tools or clinical recommendations.
