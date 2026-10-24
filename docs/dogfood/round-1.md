# Dogfood round 1 — 82 / 100

Run: `apps/gate/scripts/dogfood.sh 1 --live` (artifacts: `docs/dogfood/round-1/`, screenshots in `apps/gate/.shots/round-1/`).

| # | Item | Score | Notes |
|---|---|---|---|
| 1 | Gate loads; Begin starts everything | 3/5 | Clean load, no errors. 7 s of silence between Begin and the first words (waiting for the listening socket). |
| 2 | Greeting → gathering | 5/5 | Captions paced word by word; three offers appear. |
| 3 | Reply to a description | 5/5 | Live: "Yellow curtains in the morning light, and her radio on the counter. Shall we go there together?" |
| 4 | Photo path | 5/5 | Live: "I can see a bright living room with a sofa, round rug, and radiator. Where is this place?" then a matching plan. |
| 5 | Step through → memory, matches words | 9/10 | Forming ~6 s offline; plan accurate. Lake scene composition only fixed late. |
| 6 | Detail inside; Leave → album | 3/5 | Desktop fine. **Phone: Leave covered by other topbar controls; journey could not finish.** |
| 7 | Album interactions | 4/5 | Hover/Esc/tap verified by script; "Visit again" not yet exercised in the app. |
| 8 | Gate visuals | 6/6 | Spiral of fine aurora lines, calm sky, no seam. |
| 9 | Companions | 6/6 | Figure and Light both read at night and on white. |
| 10 | Memories look | 8/10 | Porcelain library reads refined, not cartoon. Lake needed a shoreline layout; portrait framing poor. |
| 11 | Album glass | 4/4 | |
| 12 | Type and phone layout | 3/4 | Phone memory view crops the room; companion off-screen. |
| 13 | Headset rehearsal | 8/8 | Enter, 163 frames / 3 s, memory, exit to the album. |
| 14 | Frame rate | 1/4 | Gate 67 fps; **memory 41 fps** (< 55). |
| 15 | Phone 390×844 | 0/3 | Leave unreachable (see 6). |
| 16 | Offline completes | 5/5 | Offline room, keyword planner, no voice: whole journey completes. |
| 17 | Budget ledger | 3/3 | $0.68 at the end of the round; cap $4.50 enforced server-side. |
| 18 | No typing; hands-free voice proven | 1/4 | Proven in an earlier run; **this round the Cartesia voice stalled and a turn was lost with no recovery**. |
| 19 | Typecheck and build | 3/3 | |

## Fixed after this round
- Phone topbar: compact (status becomes a dot, companion choice hidden after the gate, 44 px targets). Phone journey now completes.
- Memory frame rate: ambient occlusion was half the frame (43 → 87 fps without it) for a nearly invisible difference; now opt-in (`?ao=1`). Glass no longer uses physical transmission (an extra full render pass per frame).
- First words: wait only for the speaking token, not the listening socket.
- A turn lost to the network now gets "I'm sorry, I missed that. Could you say it again?" instead of silence.

## Untested here
Physical Quest 3 (comfort, stereo, mic inside the headset), real speech from a person with dementia and their family.
