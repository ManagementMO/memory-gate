# Cal Hacks implementation checkpoint — 2026-10-24

Branch: `codex/calhacks-apify-spacetime-meta`. User explicitly requested regular pushes and clarified **SpacetimeDB**, not SpaceXAI. Earlier practice history is retained; no eligibility claim or event submission is made.

## Implementation checklist

- [x] Fresh isolated clone; clean starting main; feature branch created on GitHub.
- [x] Read supplied project brief and hacker guide. No Apify token found in the two supplied notes. Other provider credentials are not copied into the repository or used for paid calls.
- [ ] Establish fixture baseline and portable local startup.
- [ ] Custom Apify historical-reference Actor with bounded public archive retrieval, source dates, rights, honest uncertainty, and reproducible input/output.
- [ ] SpacetimeDB authoritative memory handoff and shared reference board, integrated into the existing phone app. Convex retains existing capture, scene editing and media.
- [ ] Recipient acceptance, persistence, revocation, authorization, and two-client synchronization verification.
- [ ] Accessible UI, source replay, rendered mobile/desktop inspection, demo runbook.
- [ ] Final validation and pushed checkpoint.

## Architecture decision

Do not duplicate existing scene state into a second database. SpacetimeDB owns the new collaborative exchange: capsule delivery state and the archive references chosen together. A local server gateway authenticates existing Convex membership and uses a private SpacetimeDB database connection; browser clients never receive its operator credential. SpacetimeDB subscriptions drive filtered WebSocket updates. Original story/audio stays in Convex and is resolved under current permission at opening time. This is a meaningful new collaboration subsystem, not a claim that the whole legacy backend has migrated.

Apify receives only explicit public place/date search input, never family transcripts or recordings. Offline verification never starts cloud Actors or paid generations. Local Actor execution and Apify cloud execution must be reported separately.
