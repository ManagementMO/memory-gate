# Memory Gate / Heirloom

A family member speaks a correction on a phone. Both participants see a gold placement preview. After confirmation, the bench moves and turns in their shared 3D place. Selecting it replays the original sentence with its English reading and contributor attribution. Undo restores its previous placement and source.

This is the reviewed local Heirloom foundation, not an untested overnight completion claim. The defining shared correction, real speech/source replay, generated scenery and native emulator interactions have evidence. Physical Quest 3 and real-family validation remain open.

Start with [MORNING_REPORT.md](MORNING_REPORT.md), [the audit](docs/AUDIT_AND_IMPROVEMENTS.md), [plan alignment](docs/PLAN_ALIGNMENT.md) and [the two-minute demo](DEMO_SCRIPT.md).

This is a pre-event practice project with subsequent review improvements. The initial public import does not establish when each feature was built. Confirm event eligibility with the organizers before submitting it.

## Fresh clone setup

Use Node 22.12+ in the 22.x line, or Node 24. This review used Node 22.22.3. No provider keys or GPU worker are required for the illustrative experience.

~~~sh
git clone https://github.com/ManagementMO/memory-gate.git
cd memory-gate
npm ci
npm --prefix apps/headset ci
npm --prefix apps/phone ci
npx playwright install chromium
scripts/start-all.sh
npm run demo:room
npm run demo:links -- --illustrative
npm run verify
~~~

Startup creates the local backend and private worker/operator configuration, seeds original courtyard assets, and leaves provider flags off until you explicitly enable them. The repository includes our original models, the permitted sample photos and the earlier optional sample pack. `npm run seed -- --mocks` loads that alternative library. Its generated and third-party assets have separate terms and unresolved rights recorded in [fixtures/LICENSES.md](fixtures/LICENSES.md); inclusion does not establish commercial redistribution rights. The default courtyard uses our original models.

## Open the prepared experience

~~~sh
scripts/start-all.sh
npm run demo:links
~~~

The links command reopens the prepared courtyard without making a room or spending credits. It prints a laptop phone link, a phone/Quest Wi-Fi link and a read-only spectator link. Family links contain the room key; share them only with participants.

The phone microphone uses HTTPS port 5174. Accept the local certificate and choose Enable microphone. The Quest production build uses HTTPS port 4173. The keyboard-only phone remains at HTTP port 5173. Devices must be on the same Wi-Fi and the Mac must stay awake.

For a fresh illustrative room:

~~~sh
npm run demo:room
npm run demo:links -- --illustrative
~~~

Through the UI, choose Use the sample content, give permissions, open Story and choose Load four illustrative props. Personal rooms do not automatically receive fictional props.

## Try these actions

1. Say or type **“Mueve el banco al lado del árbol, mirando hacia la puerta.”** English: **“Move the bench beside the tree, facing the gate.”**
2. Review the gold preview. Press Keep this placement on the phone or A in the headset. The accepted bench moves and turns in every view.
3. Select the moved bench to hear that correction's original recording, then undo.

A short trigger click selects/replays and opens the gate. Hold trigger to talk. B pauses/resumes. Move a controller near the keepsake and hold squeeze/grip to inspect it; release returns it to the remembered position. Gate/keepsake exploration is local; accepted placements are shared. See [the Quest checklist](docs/QUEST_CHECKLIST.md) before calling hardware ready.

## Scenery and credentials

The main demo uses the **original illustrative courtyard** and four separate interactive models. A World Labs Marble 1.1 interpretation of our original empty set is also cached on Photo, with 100k/500k variants. Both are fictional, not a family's photograph. The generated courtyard shows floor stretching from the wide spectator camera, so it is available for review rather than selected as the presentation default. Photo can switch scenery without deleting objects or story. A separate generated living-room sample verified the full photo-world path.

Credentials live only in ignored auth/memory-gate.env (permissions 600), or a file selected by MEMORY_GATE_ENV. The teammate's MEMGATE_AUTH_FILE override remains supported; MEMORY_GATE_ENV takes precedence. See [.env.example](.env.example). Never put provider keys in frontend environment variables.

~~~sh
npm run env:push
npm run services:live
npm run doctor
~~~

Anthropic, Cartesia and World Labs authenticated and were called successfully. Optional Tripo/Modal credentials are not needed for the default experience.

World Labs explicitly requests a private Marble 1.1 world, currently documented at 1,580 API credits for an ordinary photo, including panorama preparation. A generation is asynchronous and waits for family review before display. The backend caches bounded assets and metric metadata; a lost download can recover its saved operation without another generation. The first live draft lacked calibration metadata and was correctly blocked.

There is one active generation and three submissions per room, plus a durable deployment-wide cap (default three). **The review used those three submissions**: one draft and two standard worlds. Reopening either cached standard world costs no generation credits. A later funded run can deliberately set WORLD_LABS_GENERATION_LIMIT in the private configuration and run env:push; nothing raises it automatically. This is not a guaranteed dollar cap.

## Verify

~~~sh
npm run verify         # fixture-only browser rooms; no paid generation/speech/LLM calls
npm run verify:live    # explicit paid speech and translation checks
npm run test:xr        # actual IWSDK emulator; uses the prepared practice room
~~~

Native emulator rehearsal requires the managed runtime:

~~~sh
cd apps/headset
npx @iwsdk/cli dev up --headless --allow-browser-automation --timeout 45000
cd ../..
npm run test:xr
~~~

The ordinary suite includes three typechecks, backend/domain tests, renderer tests, both production builds, mobile/two-session browser coverage and doctor. The three provider-only browser cases are intentionally skipped in ordinary verification. Live voice checks use synthesized microphone fixtures, not a real relative.

Current evidence is in evidence/review-2026-10-23/, evidence/voice-check.json and evals/REPORT.md. See the audit for exact numerators and test conditions. Earlier evidence/screens/ files and historical provider measurements were supplied with the repository and are not fresh proof from this review.

## Engineering boundaries

Convex is the transactional persistent state backend. IWSDK owns interaction; Spark renders the static world; deterministic code validates placement; Claude handles ordinary narration; the family confirms. The application does not segment arbitrary furniture out of a splat, simulate shared rigid bodies, or establish objective historical truth.

[Architecture](docs/ARCHITECTURE.md), [stack](docs/STACK.md), [limitations](docs/LIMITATIONS.md), [deployment](docs/DEPLOYMENT.md) and [decisions](DECISIONS.md) explain the current contracts and remaining work. This is Level B of the original brief, with parts of C awaiting hardware and human review.

The code, original assets and review evidence form the initial import on main at [ManagementMO/memory-gate](https://github.com/ManagementMO/memory-gate). The running application is local; publishing the repository does not deploy it. No public application deployment or event submission is part of this release. scripts/stop-all.sh stops only checkout-owned local services. If you deliberately start a Modal worker, inspect its remote status separately.
