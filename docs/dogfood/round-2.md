# Dogfood round 2 — 96 / 100

Run: `apps/gate/scripts/dogfood.sh 2 --live`, plus the voice loop rerun on its own.

| # | Item | Score | Notes |
|---|---|---|---|
| 1 | Gate loads; Begin starts everything | 4/5 | First words 1.6 s after Begin when run alone; 6 s under the full test load. |
| 2 | Greeting → gathering | 5/5 | |
| 3 | Reply to a description | 5/5 | Live: "The round wooden table, two chairs, her radio. It sounds lovely. Would you like to go there now?" |
| 4 | Photo path | 4/5 | Caption fast and right ("a bright living room with a sofa, round rug, and radiator"); the next reply fell back to the offline line once under load (7 s limit). |
| 5 | Step through → memory | 10/10 | Forming ~5 s. |
| 6 | Detail inside; Leave → album | 5/5 | Phone now completes. |
| 7 | Album interactions | 5/5 | "Visit again" verified on desktop and phone ("Here we are again."). |
| 8 | Gate visuals | 6/6 | |
| 9 | Companions | 6/6 | Light scaled up and painted stronger on white. |
| 10 | Memories look | 9/10 | Offline detail added a stray window (seeds); fixed after the round. |
| 11 | Album glass | 4/4 | |
| 12 | Type and phone layout | 4/4 | Portrait camera steps back; companion stays in view. |
| 13 | Headset rehearsal | 8/8 | 161 frames / 3 s. |
| 14 | Frame rate | 4/4 | Gate 65.5, memory 85.8 (was 41), headset quality 79.8 fps (headless Chrome, not a Quest). |
| 15 | Phone 390×844 | 3/3 | |
| 16 | Offline completes | 5/5 | |
| 17 | Budget ledger | 3/3 | |
| 18 | No typing; hands-free voice | 3/4 | In the full run Cartesia's STT socket failed to connect twice (recovery line worked); a direct Node probe and a standalone browser rerun both passed cleanly. |
| 19 | Typecheck and build | 3/3 | |

Fixed after: offline details add only what was named; "round wooden table" is round; phone companion nudged inward.
