# OrbisEngine research and the Palace of Fine Arts direction

Reviewed 2026-10-24 against [OrbisEngine commit 6477f3a](https://github.com/dtpu/OrbisEngine/tree/6477f3a710389b77c023706b9d38a2d641b42736). This is an architecture adaptation, not an import of their code, scenes or people. Their large scene media is not included in the public repository. The recommendations below are our engineering/art direction; provider quality and physical Quest performance still need direct checks.

## Immediate production pass after visual feedback

The user rejected the current visual/experiential quality. Passing backend tests and pushing commits did not establish a polished VR experience. The current small courtyard, illustrative props and static background are technical rehearsal material. Palace photos and the physical Quest will be available later; those are inputs to the next quality gate, not reasons to stop independent scene/interaction work.

Inspection found two concrete presentation problems: the app requested immersive AR with a transparent XR background, and the lite-world flag forced the entire eye buffer to scale 0.5. The new baseline requests immersive VR, disables the unused room-scanning features, keeps an opaque background, and separates the 100k/500k scenery choice from eye resolution. Default eye scale remains 0.75 pending real-device measurement; an explicit ?scale=1 is now respected even with a lite world. Pause has a persistent spatial return instruction. These changes do not make the courtyard a finished Palace scene.

The next work is a scene-production vertical slice. Keep the functioning speech, source, revision and permission systems while building this order:

| Order | Deliverable | Acceptance gate |
|---|---|---|
| 1. One coherent Palace scene | One land-side arrival/bench composition, reviewed World Labs backdrop, authored foreground paving/curb and a single lighting/material direction | Inspect straight ahead, over each shoulder and down at the ground. Modest head movement must retain plausible stereo depth. Select the world for visual quality rather than accepting a completed API job. |
| 2. Three finished near objects | A detailed bench, a photo album/frame containing an actual chosen image, and one story keepsake; correct scale, normals, roughness and ground/support contact | Each looks convincing from within reach and from the side/back. Remove floating placements and placeholder imagery. Establish simple support/collision geometry before adding dynamic bodies. |
| 3. A tactile interaction loop | Pick up/rotate the keepsake, open/select an album page, put a movable object on a valid support, and select a story object to hear its original voice | Input has immediate visual/audio feedback. Objects obey support/limits, can be recovered, and do not silently overwrite a confirmed story placement. Keep local inspection separate from accepted shared edits. |
| 4. A living setting | Restrained mesh-water ripples, a small amount of authored foliage motion, positional original-voice replay and quiet directional ambience | Effects fit the same art direction and freeze/duck correctly during pause and speech. Dynamic water requires its own reviewed mesh/mask; a static splat does not become a fluid simulation. |
| 5. Comfortable movement and a complete sequence | Two or three reviewed land-only teleport positions, snap turning, a clear arrival → story → suggestion → confirmation → replay → break sequence | Walking/teleport collision comes from authored navigation surfaces. No teleport to water or generated voids; no forced head/camera motion. All primary actions work without laptop intervention. |
| 6. Physical Quest acceptance | Test the worst active scene in both eyes; compare splat and eye-buffer settings independently and record the actual session refresh | Aim for a stable 72 Hz baseline (~13.9 ms/frame), then consider higher quality/refresh using measured headroom. A wearer checks scale, reach, tracking, microphone, input and comfort; emulator frame times cannot pass this gate. |

World Labs should supply the surrounding place; authored geometry should supply the nearby surface and behaviors. Crop/mask or compose the splat around that foreground after calibration so mesh ground and generated ground do not overlap. Match prop lighting to the already baked splat appearance. Preserve the current courtyard as a fallback while the Palace composition is reviewed.

After the single-user slice is solid, extend SpacetimeDB into live VR presence: shared pointing, transient held-object ownership/poses and participant-chosen viewpoints through the existing authenticated gateway. Keep accepted placements/revisions in their current authoritative transaction path. Actual-eye casting and smooth spectator following are separate presentation work; a remote participant must never move the headset's tracked head.

The immediate demo target is a complete short sequence: enter the Palace, hear a chosen story, see one detail become a proposal, confirm it, touch/select it to hear the same original voice, and inspect a keepsake with believable support. Evaluate that sequence on the headset before expanding the object catalog, scene count or character generation.

## What Orbis actually builds

Orbis separates expensive scene authoring from a comparatively lightweight browser runtime. A filmed clip becomes a generated static environment plus separately reconstructed moving people, object tracks and source audio. The viewer can change position while recorded time advances. The README calls this “4D.” That is different from a fully generated game with new character animation on demand.

The [pipeline graph](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/orchestrator/pipeline.py) explicitly sequences cleaning, a written world prompt, human review, one Marble job, scale fitting, placement, anchors and verification. Camera solving and per-person reconstruction can run alongside the world branch. Their documented tools include Pi3X, instance segmentation/LaMa cleaning, LHM person reconstruction and optional gsplat refinement; Modal executes GPU work and S3 stores assets. These are authoring services, not render-loop dependencies. See [their project overview](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/README.md).

The [runtime](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/fourd-runtime.js) uses Three.js and Spark for a static splat world, animated splats and optional video projection. [Object/person motion](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/person-motion.ts) has versioned manifests and integrity checks. It is not a networked, authoritative multiplayer simulation.

The [XR adapter](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/xr/fourd-xr.ts) converts scene units to physical meters, lets the headset own tracked pose, and supports teleport/snap turn, in-headset edge treatment and an adaptive splat budget. Their [render policy](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/xr/render-policy.ts) separates XR level of detail from cases requiring CPU color data. The [animation cadence](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/xr/animation-cadence.ts) can update recorded motion less often than the headset render without slowing the media clock.

The [scene session](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/scene-session.js) prepares a candidate while retaining the current scene, cancels obsolete loads, serializes activation, rolls back failures and keeps one spare scene. The [prepared-world loader](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/prepared-world-loader.ts) uses source hash and renderer build identity for an optional packed cache, with the original asset as fallback.

Their [Quest view](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/xr/quest-view.ts) copies one already-rendered eye; a [local relay](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/server/quest-view.ts) holds the latest JPEG rather than a recording. That is useful inspiration for optional headset casting. It is distinct from multiplayer scene synchronization or taking over another participant's viewpoint. Memory Gate's current spectator independently renders the same shared scene; an actual-eye cast and shared POV controls remain future work.

Their elevator [interaction prototype](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/docs/interactive-world.md) pauses recorded people and sound while a separately packaged bottle enters local physics. OpenAI Realtime voices fictional characters; local code constrains actions. It does not synthesize arbitrary new walking/reaching animations. Its [collider contract](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/src/static-colliders.ts) explicitly separates visible scenery from collision/support surfaces and records provenance.

## What transfers to Memory Gate

| Pattern | Adaptation | Current status |
|---|---|---|
| Author offline, interact live | Prepare/cache the place; use live speech, object proposals, confirmation and original-voice replay as the demonstration | Working with the fictional courtyard |
| Separate environment, props, people and audio | Palace scenery as static SPZ; close objects as independent original GLBs; original narration linked to accepted objects | Existing separation works; Palace scene not captured yet |
| Versioned scene data and provenance | Capture/source hashes, full/lite variants, metric calibration, measured reference, reviewed viewpoints and asset credits | Courtyard cache hashed; Palace capture intake now added; runtime Palace scene package remains future work |
| Transactional scene activation | Keep the visible place during loading; obsolete loads cannot replace a later selection; explicit family activation | Fixed a new-B/new-C completion race with regressions; broader multi-place session cache and full activation rollback are future work |
| Independent navigation/support data | Reviewed land-only floor and simple collision proxies; the lagoon is never a valid destination | Palace navigation is not implemented; stationary interaction remains the default |
| Headset-specific quality | Full 500k spectator, lighter 100k Quest option first; profile both eyes on the actual device before raising it | Both variants exercised; native emulator passed, physical Quest unverified |
| Local code owns actions | Model suggests; validators enforce bounds, source and revisions; a person confirms | Working; retain this boundary |

We do not need their full human-reconstruction pipeline for the current product. A relative's real voice, a shared place and several tactile props are the core experience. We also do not need to add OpenAI Realtime, Modal GPU processing or S3 just to render a Palace world: the existing Anthropic/Cartesia/World Labs/Convex path already serves those responsibilities. Reconstructing a person or making an agent speak as a relative would be a separate, consented product decision.

## Target art direction: a quiet afternoon at the Palace

Use one recognizable, intimate composition: the land-side path beside the lagoon, with the rotunda and part of the curved colonnade in view. The city describes those as the site's defining forms; see [SF Recreation and Parks](https://recpark.sf.gov/Facilities/Facility/Details/Palace-of-Fine-Arts-423). Start with that one scene, rather than promising a complete explorable park.

Aim for warm stone, restrained terracotta, sage foliage, blue-green water, soft daylight and lightly painterly surface treatment. Preserve architectural proportions and clear depth. High quality comes from a coherent composition, believable scale, sharp near objects and comfortable stereo movement. Stylization should simplify materials; it should not turn columns into irregular blobs or wash everything in sepia.

| Distance from the visitor | Representation | Purpose |
|---|---|---|
| Within reach, roughly 0–2 m | Carefully authored original meshes, visible surface detail, restrained contact shadows | Photograph/keepsake selection, grabbing and clear source attribution |
| Around the story area, roughly 2–6 m | Separate bench and any other accepted story props, aligned to a reviewed ground patch | Narration appears here; corrections affect actual independent objects |
| Surroundings | Cached World Labs architecture, foliage and lagoon | A sense of place and depth; no promise of arbitrary splat editing |

Those are composition targets, not validated hardware performance budgets. The provider already bakes appearance into splats: new scene lights do not automatically relight them like mesh materials. Match the authored props to the baked sun direction/color, then test mesh/splat depth contact. Start with static water and restrained ambient sound; add optional movement only after the base scene is stable. Head tracking must remain one-to-one, and remote scene/POV choices must never drag someone's tracked head.

## What to photograph

Capture a reference library, then choose only **2–4 views from one standing position** for the first world request. Current official [World Labs examples](https://docs.worldlabs.ai/api/world-generation-examples) support multi-image input with optional azimuths. The [OpenAPI schema](https://docs.worldlabs.ai/api/reference/openapi) currently limits ordinary multi-image mode to four views, or eight with reconstruct_images enabled. The preparation tool deliberately uses the simpler four-view mode.

1. Choose a level land-side position with a clear foreground and an attractive rotunda/lagoon view. Keep the water edge out of the immediate interaction area. Record the position in plain words.
2. From that position, take front, left, right and behind views at a consistent adult eye height. Use the normal 1× lens, hold the camera level, and keep the same lighting/exposure where possible. Add direction values only when you actually know them; they are viewing directions, not estimated 3D camera poses.
3. Separately collect a broad establishing photo, a few column/stone details and ground/bench reference pictures. They help art review and prop work; do not mix unrelated viewpoints into the initial four-image request.
4. Measure one visible thing: for example a bench seat width or paving slab. Record its actual length and show it clearly in a reference photo. Do not substitute a typical bench size for a measurement.
5. Review the exact selected images for source/permission, bystanders, obstruction and blur. Keep private photos local until an explicit provider upload. A phone's wide panorama is not necessarily a full spherical/equirectangular 360° pano; do not mark it is_pano:true unless it really is one.

These capture choices are our recommendation for controlling a stationary scene, not a guarantee of surveyed reconstruction. World Labs can invent architecture even when a request completes. Orbis records that exact failure in [known limits](https://github.com/dtpu/OrbisEngine/blob/6477f3a710389b77c023706b9d38a2d641b42736/docs/known-limits.md). Recheck the rotunda shape, land/water boundary, floor identity and stereo parallax before accepting the result.

## Preparation now available

```sh
npm run palace:prepare -- --template
# Place photos beside .logs/palace/capture.json and edit its source/review fields.
npm run palace:prepare -- /absolute/path/to/capture.json
```

The tool validates the manifest, 2–4 distinct local JPEG/PNG/WebP paths, optional known directions, file signatures and bounded sizes (8 MB each, 24 MB total). It rejects traversal and symlinks outside the capture folder, hashes the source bytes, and writes a mode-600 report under ignored .logs/palace/. It does not decode/grade images, strip EXIF, read provider keys or make any network request. Normalize/strip metadata before a real upload. Review false still produces a local report but no provider request template. Review true creates a private request template with obviously pending media IDs, not a submitted job.

The latest source-to-world prompt also accepts refined painterly material treatment instead of forcing photographic realism. This changes future requests, not the already cached courtyard. The Palace art prompt preserves the photographed ground and lagoon boundary rather than asking the model to invent an open terrace.

Next implementation stages are explicit: private image upload + approved durable job, generated full/lite cache and calibration review, one reviewed interaction floor, authored near props/lighting, then physical Quest measurement. Binding multi-image requests to the existing backend's consent/reservation/recovery path is still required; the offline preparation tool is not that binding. The previous single new generation allowance has already been used; local cap is **4/4**. No new Palace generation was made or budget limit raised for this research.

## The live moment

Label the first rehearsal fictional. If a real family member participates later, use their chosen words and real connection to the place; do not assign them a fabricated Palace history.

| Beat | Spoken line / input | Visible action |
|---|---|---|
| Establish the place | “We photographed this place outside. World Labs helped us make a space to spend time together.” | Show the reviewed source photos, then the cached Palace view once it exists. No generation wait. |
| Let the story lead | “There was a bench where we used to sit together.” | A separate bench softly appears as a gold suggestion, while the surroundings stay steady. |
| Author it together | “A little closer to the tree, facing the gate.” | Only use a supported correction with actual confirmed reference objects. Show the preview, then a person's confirmation. Do not promise arbitrary relations. |
| Give the place a voice | “This detail holds the person who told us about it.” | Select the bench; replay the original captured sentence with speaker/source. No cloned relative. |
| Let someone carry it | “You choose who keeps this story.” | Pass it through the existing Memories exchange; the recipient accepts and can reopen the source. VR handoff/POV is not yet implemented. |
| End with control | “We can pause, change it, or simply sit together.” | Pause immediately; undo remains available. |

The architectural view provides the visual reveal. The stronger demonstration is the causal chain **their words → a suggested object → a shared decision → the same voice attached to it**. Make those roles legible to the audience. This remains a conversation/reminiscence prototype for adults with younger-onset Alzheimer's; no clinical benefit or recovered historical truth is claimed.
