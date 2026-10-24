# Dogfood round 3 — 97 / 100

Run: `apps/gate/scripts/dogfood.sh 3` (no live services this round). Every automated check passed: typecheck, build,
desktop and phone journeys (0 errors, Visit again included), headset rehearsal (161 frames / 3 s), album, frame rate
(gate 69.5, memory 86.3, headset quality 82.3 fps), four generation renders.

Visual review of every frame (desktop sheet: `apps/gate/.shots/round-3/sheet-d.png`):

| # | Item | Score | Notes |
|---|---|---|---|
| 1–4 | Gate, greeting, gathering, reply | 19/20 | Startup timing still load-sensitive (see round 2). |
| 5 | Step through → memory | 9/10 | **Found:** offline rooms still drew a rectangular table. Cause: the local Convex dev server watches only `convex/`, so shared planner fixes made since 02:05 never reached the backend. Redeployed at 04:35. |
| 6–7 | Detail, album, Visit again | 10/10 | Cat appears by the chair; three moments kept; revisit works. |
| 8–12 | Visuals | 30/30 | Lake now reads: open water, dock, red rowboat beside it, cabin on the shore. |
| 13–15 | Platforms | 15/15 | |
| 16–19 | Robustness | 14/15 | Backend deploy drift is a process risk (above). |

Fix: redeployed; `dogfood.sh` now touches `convex/` before each round so the backend always runs the current shared code.
