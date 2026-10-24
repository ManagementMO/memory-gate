# Architecture — integrated October 24, 2026

Memory Gate is the current implementation of the Heirloom concept: a shared place whose accepted object placements retain the original voice behind a correction. This document describes the running code. See PLAN_ALIGNMENT.md for deliberate substitutions and remaining work.

## Responsibilities

| Layer | Implementation | Authority |
|---|---|---|
| Headset and desktop scene | Meta IWSDK 1.0.1, its compatible super-three dependency, Vite | Local input, rendering, selection, animations, native grabbing |
| Generated scenery | Spark 2.4, bounded World Labs SPZ variants | Static visual interpretation only |
| Storyteller phone | React 19, Vite, SVG placement map | Capture source speech; review, confirm, reject and undo |
| Shared backend | Convex 1.46, local persistent deployment | Membership, permissions, object state, proposals, revisions, media, durable jobs |
| Memory exchange | SpacetimeDB 2.13, authenticated Node/WebSocket gateway | Recipient acceptance/revocation and explicitly chosen shared archive references |
| Public historical references | Custom Apify Actor, Library of Congress records | Bounded public place/date search with dates, rights and uncertainty; no automatic change to a story |
| Ordinary language interpretation | Anthropic official SDK, Claude Sonnet 5.5 | Bounded structured suggestions and translation; never direct execution |
| Supported spatial commands | Shared English/Spanish grammar plus deterministic placement code | Existing-object resolution, clearance, allowed bounds and heading |
| Speech | Cartesia Ink 2 / Sonic 3.6 | Transcription and optional synthesized companion speech |
| Environment generation | World Labs Marble 1.1 | One private asynchronous world generation per reserved submission |
| Props | Twelve original procedural models exported to small GLBs | Independent interactive geometry, scale, front direction and hinge |
| Optional adapters | SHARP/Modal, Tripo | Preserved from the supplied implementation; not required for this demo |

Convex retains the functioning scene, membership, capture and media paths. The integrated exchange adds a real SpacetimeDB database behind a server gateway, which rechecks Convex membership/sharing permission and filters subscribed rows per participant. Original stories/audio stay in Convex and are resolved under current permission. Room deletion reconciles into exchange deletion. Shared VR perspectives, POV switching and importing references into the 3D world are not implemented by this exchange. See CALHACKS_RUNBOOK.md for its tested boundary.

## The correction transaction

1. A phone or headset submits one source utterance with its command ID. Audio is from that same capture, stored only with recording permission.
2. A recognized supported spatial command is resolved against confirmed objects in that room. The parser does not guess arbitrary coordinates. Other narration goes through Claude structured extraction and a second code validator.
3. Shared placement code generates candidates, checks finite transforms, fixed map bounds and conservative object spacing, then computes facing from the reference direction. Left/right use the labeled map frame.
4. The correction stores its base revision, target/reference IDs, proposed anchor/heading, previous anchor/heading/source link, and source utterance.
5. The renderer shows a separate gold preview. The accepted object remains in place.
6. Confirmation rechecks membership and revision in one mutation, commits the new placement and appends an event. A stale preview cannot overwrite a newer change. Command IDs are scoped to a room.
7. Undo records another revision and restores the previous placement and source association. Selecting the corrected bench retrieves its correction source, rather than accidentally replaying the object's earlier creation clip.

Authoritative changes are networked. Hover, a held keepsake and the gate hinge update locally each frame. They are not synchronized rigid-body simulation. Releasing the keepsake returns it to the accepted position. The starter places it within reach near the entry; physical comfort still needs testing.

## Rendering and world alignment

The illustrative courtyard has original floor/walls/planters and no baked-in interactive props. A generated world replaces that set while the same object layer and history remain. Family members can return to the illustrative courtyard from Photo without deleting either the generated files or the story.

World Labs accepts either a chosen photo (prepare-upload → private upload) or a family-selected, room-owned source utterance (text prompt). The original audio is not uploaded to World Labs. Each text source has one durable job; repeated clicks reuse it. One generation POST selects Marble 1.1 and private permissions. Scheduled GET polling and recovery reuse the saved operation. Request/source hashes and downloaded full/lite SHA-256 hashes provide provenance. Completed assets and an optional review thumbnail live in Convex storage, awaiting family activation. The cached fictional fixture can be seeded from files without a provider call. Reset retains world-source words while clearing captured audio; deleting the memory removes its source records and unshared files.

CDN downloads validate byte ranges, lengths and the SPZ header, enforce a 20 MB asset ceiling, limit parallel transfers to four and allow a bounded retry of a failed transfer. The ten-minute recovery window accommodates both full/lite downloads. This never retries the paid generation. Complete worlds retain natural colors and a 28–36 meter edge treatment converted back to provider units; single-photo reconstructions retain their nearer uncertain edge. The full 500k projector view uses a stationary 78° camera at the calibrated source height. Quest uses tracked pose and its configured full/lite choice.

Each downloaded variant is limited to 20 MB. The full representation is at most 500k splats; the prepared demo defaults to the 100k variant. Provider metadata converts raw coordinates to meters. The renderer flips OpenCV Y/Z, scales by metric_scale_factor, and translates by ground_plane_offset so the documented raw ground lands at Y=0. A response without usable metadata is rejected rather than assigned a guessed Quest scale. The live draft returned null metadata; the standard 1.1 results supplied it.

Provider metadata is an initial calibration, not a measured site survey. The Palace capture plan adds a visible measured reference and requires a headset scale/floor review before scene acceptance. Its offline preparation tool validates 2–4 selected images and prepares a private multi-image request template; it does not upload them, run a generation, import a Palace world or create navigation. See ORBIS_AND_PALACE.md for the reviewed external architecture, art direction and staged implementation.

Courtyard rooms use a stable desktop overview and fitted captions. XR uses the actual tracked head pose. No provider, LLM or database mutation runs in the render loop. Native grabbing uses IWSDK components; objects are separate from the splat, so selecting or moving a bench does not require semantic segmentation.

The headset now requests immersive VR with an opaque background. Unused AR room-scanning features are disabled. Scenery detail and eye-buffer resolution are independent: a lite world preserves the default 0.75 framebuffer scale or a validated explicit scale between 0.5 and 1.25. A break fades the memory and keeps a pinned spatial return instruction; asynchronous voice errors remain in screen UI/stats during the break. Family pause/resume was exercised while emulator XR stayed active. Physical Quest scale, readability, comfort, performance and controller B remain device acceptance work.

## Speech and cancellation

Both phone and headset reuse the 16 kHz mono PCM AudioWorklet, streaming manual-finalize recognizer and WAV encoder. The backend checks membership/voice consent and issues a short-lived Cartesia token. Direct browser streaming is a deliberate alternative to the brief's server audio relay.

A user gesture enables capture. The phone supports Record / Stop and share, cancellation, visibility cleanup and a 40-second turn limit. The voice layer stops prior playback on interruption, rejects late generations and handles reconnect/token refresh. Original clips, source transcript, English reading and contributor attribution remain distinct from synthesized companion speech.

## Trust and persistence

Every public state endpoint requires a room code and member token. The server derives identity and role from membership. The code alone permits a read-only audience join; privileged joins require the family key. Code-only readers also require active family-sharing permission. Provider secrets stay in backend environment variables. Operator switches require a separate operator code; worker/seed functions require the worker secret.

Permissions are prototype room-level scopes. File URLs are bearer capabilities and are not expiring authenticated download sessions; see LIMITATIONS.md before using private family content in a deployment. Recording revocation deletes stored clips when the scope is no longer active. Storage cleanup retains files still referenced by another memory or library version.

World generation has one active job and three submissions per room, plus a deployment-wide reservation counter that survives room deletion. The default global cap is three. Changing WORLD_LABS_GENERATION_LIMIT is an explicit operator configuration action. These are request caps, not an account balance or a global dollar budget.

An immutable offline-room mode forces all paid-service flags off even if deployment flags are enabled. Ordinary verification creates these rooms; live speech/translation checks require an explicit command. Tests do not temporarily switch off services in someone else's active room.

Local Convex data and uploaded assets persist on this Mac. Hosting and external storage were not provisioned. Restart evidence, browser evidence and actual provider evidence are kept separately under evidence/review-2026-10-23/.
