# Cal Hacks implementation checkpoint — 2026-10-24

Branch: `codex/calhacks-apify-spacetime-meta`. User explicitly requested regular pushes and clarified **SpacetimeDB**, not SpaceXAI. Earlier practice history is retained; no eligibility claim or event submission is made.

## Latest user direction — not yet implemented

The user wants SpacetimeDB to drive shared collaboration and 3D perspectives inside VR, with POV switching a priority. They also suggested Apify Instagram photo ingestion into a memory, asked for actual headset verification with the correct software, and reiterated checking supplied credentials and pushing small checkpoints. The current exchange/board is implemented. Synchronized perspectives and POV switching are now implemented on branch `social-experience` (see `docs/SOCIAL_EXPERIENCE.md` for exactly what has and hasn't been verified); Instagram ingestion is still outstanding. Keep this distinction explicit when reporting progress.

## Implementation checklist

- [x] Fresh isolated clone; clean starting main; feature branch created on GitHub.
- [x] Read supplied project brief and hacker guide. No Apify token found in the two supplied notes. Other provider credentials are not copied into the repository or used for paid calls.
- [x] Baseline: original 69 tests passed. Added authorization tests bring this to 71/71. Phone production build and three typechecks pass; renderer 4/4 passes. Local Convex and SpacetimeDB 2.13.0 started.
- [x] Custom Apify historical-reference Actor with bounded public archive retrieval, dates, rights, uncertainty and schemas. Six offline Actor tests pass. Real local Actor execution and browser search → explicit choice → two-client board verified. Cloud execution remains pending.
- [x] SpacetimeDB private tables/reducers published locally; subscribed gateway and integrated Memories screen implemented. Convex retains existing capture, scene editing and media.
- [x] Five actual database/gateway scenarios: recipient acceptance, idempotency, revocation, authorization, board contribution rights, and deletion across stores. Actual database and gateway restarts preserved accepted stories and chosen references.
- [x] Three new browser scenarios; mobile/desktop inspection; source display, focus and revocation; explicit recording-consent test. Runbook in docs/CALHACKS_RUNBOOK.md.
- [x] Existing browser suite: 24 passed together, three paid-provider cases skipped. Four typechecks, both builds, 71 backend tests and four renderer tests pass. Windows ANGLE D3D11 fixed the software-renderer stall without weakening state assertions.
- [x] Implementation checkpoints pushed; final runbook/evidence push follows.
- [ ] Apify cloud deployment/run (no supplied Apify credential), physical Quest check, and current native emulator input rehearsal (managed Chromium spawn failure). No cloud, hardware or eligibility claim is made.

## Architecture decision

Do not duplicate existing scene state into a second database. SpacetimeDB owns the new collaborative exchange: capsule delivery state and the archive references chosen together. A local server gateway authenticates existing Convex membership and uses a private SpacetimeDB database connection; browser clients never receive its operator credential. SpacetimeDB subscriptions drive filtered WebSocket updates. Original story/audio stays in Convex and is resolved under current permission at opening time. This is a meaningful new collaboration subsystem, not a claim that the whole legacy backend has migrated.

Apify receives only explicit public place/date search input, never family transcripts or recordings. Offline verification never starts cloud Actors or paid generations. Local Actor execution and Apify cloud execution must be reported separately.
