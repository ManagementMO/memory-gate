# Heirloom / Memory Gate — review handoff

## Open now

The local stack is running. Open the [spectator](https://localhost:4173/?room=6N9S4X&view=spectator&drift=0), or run:

~~~sh
npm run demo:links
~~~

That prints the exact family phone/Quest links without creating a room, resetting data or spending credits. On a physical phone/Quest use the printed Wi-Fi links, accept the local certificate, and keep the Mac awake. If services stop, run scripts/start-all.sh.

## Try these three actions

1. On the HTTPS phone, join with your name, Enable microphone, then Record / say **“Mueve el banco al lado del árbol, mirando hacia la puerta”** / Stop and share. Typing the English or Spanish command also works.
2. Review the gold bench and choose Keep this placement. Watch the accepted bench move and face the gate in the phone map and 3D scene.
3. Select the moved bench to replay that correction's original recording with its English reading and attribution. Undo restores the prior placement and source. You can also select the gate or squeeze/grab the nearby keepsake.

## Reached: Level B, with hardware and human gates open

The defining shared editing experience, actual speech/source playback, persistent state and actual generated-world integration work. The main demo deliberately uses the cleaner **original illustrative courtyard**. A generated courtyard and a public-domain living-room interpretation are cached and load in Spark. The generated courtyard stretches its floor from wide camera views; it is available for review, not selected as the best presentation view.

Anthropic, Cartesia and World Labs authenticated and were called successfully. Real STT tests used synthesized microphone fixtures, not a real relative. No physical Quest or real-family pass is claimed. The initial import for ManagementMO/memory-gate includes the full application, original assets, optional earlier sample pack, historical artifacts and fresh review evidence. The sample pack's source-specific terms and unresolved rights remain recorded in fixtures/LICENSES.md. Private credentials and machine-local runtime data stay local. No public application deployment or event submission was made.

## Current verification

- 56/56 backend/domain regressions.
- 4/4 renderer/async-world/floor-buffer checks.
- All three TypeScript checks and both production builds.
- 24/24 browser tests in the final explicit live run, including Spanish speech → confirmed 3D correction → pointer-selected original source replay, invitation routing and above-fold recording on a narrow phone.
- Ordinary verification uses server-enforced offline rooms; 21 browser cases pass and 3 provider-only cases are intentionally skipped.
- 24/24 live voice harness checks with synthesized audio; internal language evaluation: 30/30 intents, 29/30 complete cases, zero unauthorized actions.
- Actual immersive emulator rehearsal: native squeeze grab, held movement, return on release, trigger-driven gate, no render-loop error.
- An actual checkout-owned Convex/backend restart preserved both prepared rooms, canonical object IDs/placements/revisions and generated full/lite files.
- LAN HTTPS production check: 120 frame intervals, p50 16.7 ms and p95 16.8 ms in headless Chrome on this Mac. This is not Quest performance.
- Provider keys were kept in ignored local files, not frontend code. The audit includes dependency/security checks and their evidence boundary.

See docs/AUDIT_AND_IMPROVEMENTS.md for commands and artifacts; docs/PLAN_ALIGNMENT.md explicitly lists unimplemented parts of the longer brief.

## What changed materially

The supplied build could add and confirm objects, but did not implement the shared existing-object correction moment. It also depended on absent large fixtures and another machine's paths.

The review added authoritative spatial proposals, stale/idempotency protections, shared gold previews, animated accepted transforms, source-aware undo/replay, phone recording, original portable assets, a gate hinge and native keepsake interaction. It added live World Labs generation, cached full/lite assets, strict metric metadata checks, hashes and recovery without another paid POST. It fixed negated commands, recall questions creating geometry, cross-room command IDs, referenced-file deletion, floor instance buffers and viewer-sharing permissions. Startup now uses checkout-owned detached processes.

## World generation and budget

Three generation requests were submitted: one draft, a standard living room and a standard courtyard. The draft completed but lacked calibration metadata and was blocked. Both standard worlds completed, cached and loaded. Standard job totals were about 5.4–5.6 minutes in this run; reopening the cached scene is separate and does not generate a world.

The documented non-panorama request prices sum to an estimated 3,390 API credits for those selections (230 + 1,580 + 1,580, including panorama preparation); that is not a provider invoice. API billing is separate from Marble web credits. The durable default global submission cap is now 3/3. Existing cached worlds work. A later funded run can deliberately set WORLD_LABS_GENERATION_LIMIT in auth/memory-gate.env and run npm run env:push; the app does not automatically raise limits or buy credits. See [current provider pricing](https://docs.worldlabs.ai/api/pricing).

The application still lacks the brief's fully reconciled cross-provider LLM/STT/TTS dollar/unit ledger. Do not treat request caps as a guarantee of a total dollar amount.

## Remaining work that matters

1. Wear the actual Quest 3 and complete docs/QUEST_CHECKLIST.md: comfort, stereo, microphone/recording inside XR, controller behavior and measured frame pacing.
2. Have the consenting relative/bilingual teammate test their actual language and story. Review the transcript/interpretation; the initial supported command pair is EN/ES.
3. Improve generated-world composition from a better reference or calibration/renderer strategy before making that courtyard the default. Current movable props remain separate; arbitrary splat segmentation and generated-mesh collision are not implemented.
4. Before external/private-family deployment, finish authenticated/expiring media, stronger invitations/per-contributor consent, aggregate provider quotas and durable hosting. Inline transcript repair, recoloring an existing prop, full history playback and memory export are also incomplete.

## Files to use

- README.md — exact start/configuration/test commands.
- DEMO_SCRIPT.md and docs/DEMO_RUNBOOK.md — supported demonstration and recovery.
- docs/ARCHITECTURE.md, docs/STACK.md and DECISIONS.md — real responsibilities and substitutions.
- docs/PLAN_ALIGNMENT.md and docs/LIMITATIONS.md — gaps against the full brief.
- evidence/review-2026-10-23/ — fresh screenshots, provider/renderer/restart/XR evidence.
- evidence/review-2026-10-23/demo-correction.webm — silent backup of the actual browser flow with synthesized source input.
- auth/memory-gate.env, .env.worker and .logs/ — private ignored configuration/checkpoints, never public artifacts.

This is a substantially improved, runnable foundation. Presentation readiness still depends on the hardware and human checks above.
