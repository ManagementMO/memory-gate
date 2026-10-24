# Current Windows verification — 2026-10-24

These artifacts belong to `codex/calhacks-apify-spacetime-meta`. They use fictional participants and synthetic test stories. Earlier folders record earlier machines/runs and are not evidence of a current Windows or physical-headset pass.

| Check | Result |
|---|---|
| Backend/domain regressions | 71/71 passed, including current membership, source ownership and actual recording-consent revocation |
| Renderer unit regressions | 4/4 passed |
| Apify Actor contracts | 6/6 passed; bounded requests, dates, rights and conditional-rights exclusions |
| Actual SpacetimeDB/gateway | 5/5 passed; private-table access, cross-room denial, recipient acceptance, revisions/idempotency, revocation, contributor-only unpin and room deletion |
| New browser scenarios | 3/3 passed, including real local Apify search and a second participant's shared board |
| Restart persistence | Actual database restart and actual gateway restart both preserved accepted memories, original source resolution and chosen references |
| Compile | Backend, phone, headset and SpacetimeDB typechecks; both frontend production builds passed |
| Startup | `npm run local:up` passed with existing persistent local data |
| Existing full browser suite | 24/24 offline scenarios passed together; three paid/provider cases deliberately skipped. Windows tests use IWSDK's ANGLE D3D11 backend so the renderer's animations complete. |
| Native immersive rehearsal | Current managed Chromium could not spawn on Windows (`spawn UNKNOWN`); no fresh native-input pass claimed |
| Apify cloud / physical Quest | Not run |

`apify-local-run.json` is a real local Actor retrieval manifest. `desktop-pass.png`, `mobile-receive.png`, `mobile-open.png` and `mobile-archive.png` show the actual browser flow. `database-restart.json` and `gateway-restart.json` record process restart checks. The `legacy/` captures come from the existing offline browser tests; test-room credentials are temporary and their rooms are deleted by cleanup.

No screenshot or local SDK run is represented as a cloud run, physical Quest measurement, patient evaluation or proof of historical accuracy.
