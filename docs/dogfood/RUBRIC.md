# Dogfood rubric (100 points)

Each round runs `apps/gate/scripts/dogfood.sh N` and then a person (here, Claude) uses the result like a
visitor would: look at every screenshot, read every line the companion says, and score honestly. A build is
called finished only after five rounds holding 99/100. Points are lost for anything a visitor would notice.

## A. The journey works (40)
| # | Item | Pts |
|---|---|---|
| 1 | Gate loads cleanly (no console errors); Begin starts sound, voice and the companion | 5 |
| 2 | Greeting → gathering: captions readable and paced; offers appear | 5 |
| 3 | A description gets a warm, specific, short reply that invites stepping in | 5 |
| 4 | A shared photo floats in the gate; the companion says what it sees; the plan follows the photo | 5 |
| 5 | Stepping through → forming → memory in ~15 s; the place matches the words | 10 |
| 6 | Something said inside appears; Leave → the album holds the visit's moments | 5 |
| 7 | Album: hover/tap expands; Esc closes; Visit again and Visit another work | 5 |

## B. It looks the part (30)
| # | Item | Pts |
|---|---|---|
| 8 | The gate: aurora lines, calm, one focal point, no artifacts | 6 |
| 9 | Both companions read well at night and on white; moods are distinct | 6 |
| 10 | Memories: porcelain-and-light, not low-poly cartoon; composition and lighting | 10 |
| 11 | Album liquid glass over the aurora | 4 |
| 12 | Typography, spacing, and the phone layout | 4 |

## C. Platforms (15)
| # | Item | Pts |
|---|---|---|
| 13 | Headset rehearsal: enter, captions in 3D, memory, exit to the album | 8 |
| 14 | Frame rate: desktop ≥ 55 fps in headless Chrome; headset quality mode lighter | 4 |
| 15 | Phone 390×844: everything reachable, nothing overlaps | 3 |

## D. Robustness (15)
| # | Item | Pts |
|---|---|---|
| 16 | Offline room / no AI: the whole journey still completes, honestly simpler | 5 |
| 17 | Spending stays under budget with a working ledger and cap | 3 |
| 18 | No typing anywhere; hands-free voice loop proven end to end | 4 |
| 19 | Typecheck and production build pass | 3 |

Evidence that can't be produced here (a person wearing a physical Quest 3, a person with dementia and their family)
is out of scope for the score and is listed in each round's notes as untested.
