# Cal Hacks implementation checkpoint — 2026-10-24

Branch: `codex/calhacks-apify-spacetime-meta`. User explicitly requested regular pushes and clarified **SpacetimeDB**, not SpaceXAI. Earlier practice history is retained; no eligibility claim or event submission is made.

## Implementation checklist

- [x] Fresh isolated clone; clean starting main; feature branch created on GitHub.
- [x] Read supplied project brief and hacker guide. No Apify token found in the two supplied notes. Other provider credentials are not copied into the repository or used for paid calls.
- [x] Baseline: original 69 tests passed. Added authorization tests bring this to 71/71. Phone production build and three typechecks pass; renderer 4/4 passes. Local Convex and SpacetimeDB 2.13.0 started.
- [x] Custom Apify historical-reference Actor implemented with bounded public archive retrieval, source dates, rights, honest uncertainty, input/output schemas. Five offline Actor tests pass. Live archive execution still to verify.
- [x] SpacetimeDB private tables/reducers published locally; subscribed gateway and integrated Memories screen implemented. Convex retains existing capture, scene editing and media. End-to-end verification pending.
- [ ] Recipient acceptance, persistence, revocation, authorization, and two-client synchronization verification.
- [ ] Accessible UI, source replay, rendered mobile/desktop inspection, demo runbook.
- [ ] Final validation and pushed checkpoint.

## Architecture decision

Do not duplicate existing scene state into a second database. SpacetimeDB owns the new collaborative exchange: capsule delivery state and the archive references chosen together. A local server gateway authenticates existing Convex membership and uses a private SpacetimeDB database connection; browser clients never receive its operator credential. SpacetimeDB subscriptions drive filtered WebSocket updates. Original story/audio stays in Convex and is resolved under current permission at opening time. This is a meaningful new collaboration subsystem, not a claim that the whole legacy backend has migrated.

Apify receives only explicit public place/date search input, never family transcripts or recordings. Offline verification never starts cloud Actors or paid generations. Local Actor execution and Apify cloud execution must be reported separately.
