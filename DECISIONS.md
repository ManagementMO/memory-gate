# Review decisions

- Updated 2026-10-24 (`social-experience`): perspectives (grandparent 1.6 m, grandchild 1.1 m) live in SpacetimeDB through the team's existing gateway path, not direct browser connections: one Convex-checked socket, private tables, operator-only reducers, room-scoped pushes. A perspective's own additions never rewrite the shared memory plan (`sketch.detail` with `persist:false`). The headset changes eye height by scaling the XR origin (never by moving the tracked head). Likenesses are built offline from the family's own photos; only a GLB is uploaded, and a minor's needs a named guardian's agreement. See `docs/SOCIAL_EXPERIENCE.md`.
- Updated 2026-10-24 after the user explicitly selected SpacetimeDB: preserve existing Convex capture/media/scene state and make SpacetimeDB authoritative for the new collaborative memory exchange and reference board. Private tables plus an authenticated gateway avoid exposing the publisher credential. This supersedes the original review's no-SpacetimeDB scope.
- Use an actual Apify Actor with public institutional sources, explicit provenance/rights and a user-selected board. Local execution is verified; cloud execution remains unclaimed until a token, deployment and real run are available.
- Reconcile room deletions across stores using an authenticated, bounded absence query; do not infer deletion from a transient authentication or network error.
- Implement the defining existing-object correction transaction before adding scenery polish.
- Keep English/Spanish spatial commands deliberately bounded and visibly labeled. General narration uses Claude; placement is deterministic code.
- Separate generated static scenery from independently interactive props and from accepted memory state.
- Replace absent large model fixtures with reproducible original geometry and retained license/provenance.
- Request Marble 1.1 explicitly. The cheaper draft lacked metric metadata in the live response and was blocked. Keep private permissions and require review before display.
- Cache 500k/100k SPZ variants; use 100k in the prepared demo. Reject invalid/missing calibration rather than guessing a metric world.
- Persist request/photo hashes, operation ID and artifact hashes. Recover the same operation after download errors, never blindly create a second paid world.
- Keep a durable global generation reservation counter separate from room cleanup. Its default three submissions are consumed; only an operator can deliberately change the configured limit.
- Make ordinary verification fixture-only at the backend room boundary, with explicit live opt-in. Do not toggle global services while testing another room.
- Block code-only audience reads when family sharing is off. Treat existing file URLs and per-contributor privacy as production gaps.
- Put the keepsake near the entry and use an explicit courtyard overview for desktop. XR remains tied to actual tracked pose.
- Source publication follows the user's request for one initial commit at ManagementMO/memory-gate. Public application deployment, event submission, purchase, voice cloning and physical-headset validation are separate actions; none is implied by publishing the source.
