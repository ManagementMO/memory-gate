# Audit and improvements — October 23, 2026

## Verdict

The friend's agent built a substantial working application. It had useful Convex membership/consent logic, persistent shared state, a well-developed streaming speech pipeline, shader transitions, replay and pause, a photo reconstruction worker, and meaningful browser tests. It did **not** deliver the whole Heirloom brief. In particular, its model pipeline could add objects but could not move/turn existing ones through the defining shared correction interaction.

The initial 31 smoke tests and all three TypeScript checks passed on this machine. Manual inspection and new behavioral regressions exposed missing behaviors and defects that those tests did not cover. The public initial import at ManagementMO/memory-gate includes the improvements, portable original assets, optional earlier sample pack, provenance, setup and fresh evidence. Source-specific asset terms remain in fixtures/LICENSES.md. Application services remain local; no public application deployment was made.

## Findings and resulting behavior

| Finding in the supplied checkout | Change and current evidence |
|---|---|
| No existing-object placement corrections or renderer updates for changed anchors | Added authoritative correction records, deterministic spacing/facing, shared ghost previews, confirmation/rejection, stale-revision protection, source links and undo. Rendered position/orientation now follow accepted records. Two phones plus the actual 3D renderer pass the full flow. |
| Core “speech → correction → original audio” demo absent | A new live browser test speaks a synthesized Spanish sentence through real Cartesia STT, confirms the placement, clicks the rendered bench, and verifies replay of that correction's clip, English text and contributor attribution. |
| Phone storyteller could only type | Added accessible tap-to-record/stop-and-share, explicit mic enabling, consent-aware source recording, cancellation, visibility cleanup and a 40-second turn cap. It reuses the headset's streaming recognizer and recording code. HTTPS port 5174 supports microphone use on the LAN. |
| All original `fixtures/large/` models and splats were absent here | Added deterministic original geometry and a courtyard, plus reproducible export/seed commands for 12 small GLBs. The UI distinguishes this illustration from a reconstructed photo. No replacement splat was fabricated. |
| No gate hinge or held keepsake | A selected gate opens/closes locally. The keepsake uses native IWSDK `OneHandGrabbable`/`Grabbed` with squeeze, follows the controller, and returns to its accepted placement on release. Actual emulator input and state were verified. |
| World Labs was checked by doctor but not used for generation | Added private upload/generation, explicit Marble 1.1, durable polling, bounded 500k/100k cache, metric conversion, hashes, review, timeout and recovery of the same operation. Two standard worlds generated and loaded live. A draft with null metric metadata was blocked. The generated courtyard has visible stretching in wide views, so the cleaner illustrative set is the default demo. |
| Negated moves could become confirmation, including curly-apostrophe input | Added deterministic no-change guards in both model validation and offline interpretation. “No lo muevas,” “Don't move it,” and “Don’t move it” do not edit the scene. |
| A recall question could create an object in offline mode | Added a question guard and regression tests. A question about a piano stays a question; pause requests retain their pause behavior. |
| Command IDs were deduplicated globally across rooms | Added room-scoped compound indexes and authenticated lookups. Reusing the same command ID in another room neither suppresses its command nor returns another room's object/utterance ID. |
| Ordinary verification could unexpectedly consume provider credits | Added immutable offline rooms enforced on the server. Ordinary tests cannot be enabled by global live switches. Three provider-only browser checks require explicit live opt-in. |
| Generation limits could reset when a room was deleted | Added deployment-wide durable reservations and a deliberate operator limit. The default three submissions were used; cached worlds remain usable. No claim of a complete cross-provider dollar ledger. |
| A code-only viewer could read while family sharing was off | Read authorization now checks sharing permission. A regression verifies blocked access before permission and after revocation. Existing bearer file URLs remain a documented production limitation. |
| Updating seed models deleted files still referenced by old memories | Asset replacement now deletes only unreferenced files. Room deletion/reset preserve versions used by other memories and clean them when the final reference disappears. Regression checks cover two memories and unused-file cleanup. |
| Startup, browser scripts and worker tools relied on another person's home directory | Local auth path/configuration, dependency-based Playwright/Three resolution, portable original seeding, current startup commands and checkout-scoped shutdown replace the relevant private paths. |
| Reframed spectator view exposed missing floor draw batches and cropped replay captions | Corrected instance capacity, added a GPU-buffer-capacity regression, and fitted the replay card to the overview camera. The browser check verifies projected caption bounds. |
| The proximity-only keepsake started too far from the entry for a small standing area | Moved the sample keepsake near the entry and repeated native grab/move/release/return with actual emulator inputs. Physical reach and comfort still need a wearer. |
| npm audit reported vulnerable direct/transitive packages | Patched Zod and the existing Sharp override. Root, phone and headset audits report no advisories at review time. |

## The verified defining interaction

The Spanish fixture says: **“Mueve el banco al lado del árbol, mirando hacia la puerta.”** It is explicitly synthesized test speech, not a real relative's recording.

1. The phone records actual microphone PCM at real-time pacing and sends it to Cartesia with a short-lived room token.
2. The returned transcript and, with recording permission, the original WAV are stored together.
3. The bounded English/Spanish spatial parser identifies existing confirmed objects. Application code computes candidate positions, object spacing and facing. No model supplies executable code or arbitrary coordinates.
4. Both phones and the 3D renderer show the proposed bench separately in gold. The accepted bench stays put.
5. Confirmation checks the base revision and applies one accepted change. Other clients receive the same anchor and heading. Undo restores the prior placement and source link.
6. Actual pointer input selects a mesh of the moved bench. Its correction recording replays, with original words, English reading and contributor attribution.

The normal conversational path still uses Claude structured extraction and a code validator. Spatial commands are a deliberately bounded deterministic grammar, labeled **Guided spatial command**. Supported relations are beside/left/right and facing an existing object; this is not an unrestricted multilingual spatial reasoning system.

## Fresh evidence and commands

| Gate | Result |
|---|---|
| `npm run typecheck`; phone/headset typechecks | Pass |
| `npm test` | 56/56 backend/domain tests |
| `npm run test:headset` | 4/4 renderer, asynchronous world cancellation and floor-buffer checks |
| `npm run e2e` | 21 fixture-only cases pass; 3 provider-only cases intentionally skipped |
| `npm run verify:live` / `npm run e2e:live` | 24/24 browser tests; all typechecks, tests and builds in the final complete live pass |
| `node apps/headset/scripts/voice-check.mjs --turns 2` | 24/24 real-provider checks with synthesized microphone input |
| `npm run test:xr` | Pass: native squeeze grab, held motion, return, trigger-driven gate; immersive session remains active |
| Phone and headset production builds | Pass |
| LAN HTTPS production browser | Pass: four rendered props, no page/tick errors, secrets denied with 403, ~60 fps on this Mac |
| Actual backend/database restart | Both prepared rooms, canonical placements/revisions and cached full/lite world files preserved |
| World Labs live | Two standard worlds complete/cache/load; full/lite switch and return to illustrative set preserve props/story |
| `npm audit --json` in all three npm projects | Zero reported vulnerabilities |

Live voice harness measurements in this run: release to final transcript p50 **153 ms** over six recorded turn timings; companion request to first scheduled audio p50 **238 ms** over six timings. These are test-fixture measurements, not venue, physical microphone, accent or end-to-end product guarantees. The separate Spanish source-replay test verifies behavior rather than advertising a latency number.

The 30-case internal language evaluation produced **30/30 correct intents**, **29/30 complete cases**, **6/6 held-out cases**, and **zero unauthorized actions**. Median model response was **1,928 ms**. One adversarial utterance mentioning a television and sign retained only the sign. The raw model run estimated **$0.1505** using the evaluator's configured rates; this is not a provider invoice. Revalidation after the question guard made no new model calls and found zero unauthorized actions for both stored live outputs and the offline mock. Offline mock accuracy remains much lower (22/30 complete cases); it is visibly labeled and should not be presented as live multilingual understanding.

Artifacts:

- `evidence/review-2026-10-23/screens/spoken-correction-replay-3d.png`
- `evidence/review-2026-10-23/screens/correction-preview-3d.png`
- `evidence/review-2026-10-23/screens/correction-confirmed-phone.png`
- `evidence/review-2026-10-23/spoken-correction.json`
- `evidence/review-2026-10-23/xr-rehearsal.json`
- `evidence/review-2026-10-23/worldlabs-live.json`
- `evidence/review-2026-10-23/generated-courtyard.json`
- `evidence/review-2026-10-23/visual-review.json`
- `evidence/review-2026-10-23/persistence-restart.json`
- `evidence/review-2026-10-23/production-check.json`
- `evidence/review-2026-10-23/e2e-live.txt`
- `evidence/review-2026-10-23/demo-correction.webm` (silent backup, synthesized source input)
- `evidence/voice-check.json`
- `evals/results-2026-10-24T01-07-25-668Z-review-live.json` (fresh raw model calls)
- `evals/results-2026-10-24T01-20-21-620Z-review-validated.json` (same outputs revalidated, no new calls)
- `evidence/doctor-latest.txt`

Historical screenshots, legacy-pack renders and GPU logs are included as earlier supplied evidence; they are not proof from this review. Test traces and synthetic microphone WAVs are local ignored artifacts. Provider credentials remain in ignored local files with permissions 600.

## Remaining gates

**Physical Quest 3:** stereo rendering, frame pacing, microphone permission while immersed, hand tracking, passthrough, comfort and room boundaries still require a wearer. ADB is not installed on this host. Emulator proof does not establish physical-device readiness.

**Generated-world visual quality:** live upload, generation, caching and full/lite rendering passed. The two Marble 1.1 outputs returned metric data; one draft returned null data and was blocked. The generated courtyard stretches its floor when viewed from the wide spectator camera. Keep the cleaner illustrative courtyard as the default presentation scene until reference/composition quality improves. The [official media-upload workflow](https://docs.worldlabs.ai/api/reference/media-assets/prepare-upload), [operation polling](https://docs.worldlabs.ai/api/reference/operations/get) and [SPZ metric/axis conversion](https://docs.worldlabs.ai/api/rendering-spz) informed this implementation.

**A real family story:** test the chosen relative's actual language/dialect, obtain their agreed recording/sharing permissions, replace synthetic lines with their story, and have them review the interpretation. Synthetic tests do not validate transcription quality for that person.

**Generated-world interactions:** props are separately authored models, and spatial edits use conservative object-spacing rules in a fixed map frame. Static splats are not semantically segmented or collision-aware architecture. The native keepsake and gate interactions are local exploration, not synchronized rigid-body simulation. The keepsake in the starter is a symbolic illustration.

**Delivery/performance:** all current services are local to this laptop. No public deployment was made. The headset bundle still emits a large-chunk warning (IWSDK/Spark); hardware loading and sustained frame pacing are unmeasured. Tripo and SHARP/Modal live paths and their historical timings were not reverified.

**Full brief:** docs/PLAN_ALIGNMENT.md records deliberate Convex/direct-speech substitutions and incomplete inline transcript repair, existing-prop recoloring, full history playback/export, expiring media, per-contributor permissions and aggregate LLM/STT/TTS budgeting. This is Level B, with parts of C awaiting hardware and human evidence.

This is now a much stronger runnable foundation. It is not evidence of a guaranteed hackathon win or a fully validated physical-headset experience.
