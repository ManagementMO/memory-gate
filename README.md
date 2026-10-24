# Memory Gate / Heirloom

**Integrated main:** the [World Labs story demonstration](DEMO_SCRIPT.md) and [Cal Hacks exchange runbook](docs/CALHACKS_RUNBOOK.md) are both available. The **Memories** tab lets two participants pass, accept and reopen original stories. SpacetimeDB owns that exchange and its shared reference board; a custom Apify Actor supplies public historical references for people to choose. Scene editing, media and capture remain in Convex. Start locally with `npm run local:up` after the dependencies and SpacetimeDB CLI are installed.

An adult living with younger-onset Alzheimer’s shares a story with someone close to them. Their words can suggest objects in a shared place, on a screen or an optional Quest 3. Family members review visual suggestions together. Original recordings, translations and contributor attribution stay with the story. This is a reminiscence and conversation prototype; clinical benefit has not been established.

The main story demo now opens a realistic World Labs courtyard prepared from fictional sample words. A spoken detail forms a separate golden object; the family reviews it, confirmation gives it a solid form, and selecting it replays the original captured sentence. A family member can also explicitly request a private setting from selected story words. The original illustrative garden, shared correction/undo, simpler storyteller screen and immediate pause remain available. Uncertain recall stays as conversation, rather than becoming scene evidence. See [the current handoff](MORNING_REPORT.md) for verification and remaining gates.

The prior review established the shared-correction foundation and recorded earlier speech, scenery and emulator evidence. The current branch separately verifies the new exchange and archive flows. Physical Quest 3 and real-family validation remain open.

Start with [MORNING_REPORT.md](MORNING_REPORT.md), [the audit](docs/AUDIT_AND_IMPROVEMENTS.md), [plan alignment](docs/PLAN_ALIGNMENT.md) and [the two-minute demo](DEMO_SCRIPT.md).

The current creative direction is **[The Red Kite](docs/red-kite/README.md)**: a fictional California childhood meadow, a childhood friend and a handmade kite. The new Marble 1.1 meadow is generated and cached; `npm run demo:kite` opens its reusable fictional room without another generation. A separate [2D concept rehearsal](docs/red-kite/rehearsal.html) demonstrates source-linked illustration choices. The [teammate brief](docs/red-kite/TEAMMATE_ASSET_BRIEF.md) specifies the separate Blender assets and native interactions still to build. The earlier [Palace research](docs/ORBIS_AND_PALACE.md) remains as reference; that scene is no longer the chosen direction.

This is a pre-event practice project with subsequent review improvements. The initial public import does not establish when each feature was built. Confirm event eligibility with the organizers before submitting it.

## Fresh clone setup

Use Node 24 (the current Windows verification used 24.19) and the SpacetimeDB 2.13.0 CLI on PATH. No provider keys or GPU worker are required for the illustrative experience or local Apify Actor.

~~~sh
git clone https://github.com/ManagementMO/memory-gate.git
cd memory-gate
npm ci
npm --prefix apps/headset ci
npm --prefix apps/phone ci
npm --prefix actors/historical-memory-atlas ci
npm --prefix spacetimedb ci
npx playwright install chromium
npm run local:up
npm run demo:links -- --illustrative
npm test
~~~

Startup creates the local backend and private worker/operator configuration, seeds original courtyard assets, and leaves provider flags off until you explicitly enable them. The repository includes our original models, the permitted sample photos and the earlier optional sample pack. `npm run seed -- --mocks` loads that alternative library. Its generated and third-party assets have separate terms and unresolved rights recorded in [fixtures/LICENSES.md](fixtures/LICENSES.md); inclusion does not establish commercial redistribution rights. The default courtyard uses our original models.

## Open the prepared experience

~~~sh
npm run local:up
npm run demo:links
~~~

The links command reopens the prepared courtyard without making a room or spending credits. It prints a laptop phone link, a phone/Quest Wi-Fi link and a read-only spectator link. Family links contain the room key; share them only with participants.

The phone microphone uses HTTPS port 5174. Accept the local certificate and choose Enable microphone. The Quest production build uses HTTPS port 4173. The keyboard-only phone remains at HTTP port 5173. Devices must be on the same Wi-Fi and the computer must stay awake.

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

On the phone, **Simpler storyteller view** hides arrangement tools while keeping recording, original words, typed input and pause available. **Open the shared place** embeds the read-only 3D view only with family-sharing permission; it does not request microphone access. The still garden image is a capture of our illustrative renderer, not an uploaded family photograph or a live view. Storytellers join in the simpler view by default and can reveal the family tools themselves.

## Scenery and credentials

The main story demo uses the **new cached World Labs courtyard**, generated directly from fictional words rather than an image of the illustrative set. Both 500k/100k SPZ variants, a preview and hashed metric metadata are checked into fixtures/worlds/. Run npm run seed:world once, then npm run demo:journey for a ready, empty stage; it reopens the existing sample unless --new is explicit. npm run demo:links prefers that room. No generation credits are used by these commands. The projector uses the full 500k world with a 78° field of view; the Quest keeps its configured lighter option. Generated details are unverified, and movable objects remain separate.

The earlier illustrative courtyard and cached photo interpretations remain available. npm run demo:links -- --illustrative selects the original four-prop rehearsal. Photo can switch scenery without deleting objects or story.

Credentials live only in ignored auth/memory-gate.env (permissions 600), or a file selected by MEMORY_GATE_ENV. The teammate's MEMGATE_AUTH_FILE override remains supported; MEMORY_GATE_ENV takes precedence. See [.env.example](.env.example). Never put provider keys in frontend environment variables.

~~~sh
npm run env:push
npm run services:live
npm run doctor
~~~

Anthropic, Cartesia and World Labs authenticated and were called successfully. Optional Tripo/Modal credentials are not needed for the default experience.

World Labs explicitly requests a private Marble 1.1 world, currently documented at 1,580 API credits for text or an ordinary photo, including panorama preparation. In family tools, review the selected words and explicitly approve generation. Original audio is not sent to World Labs. Generation takes minutes and waits for review before display. Repeated clicks reuse the source's existing job. The backend caches bounded assets and metric metadata; download recovery reuses the saved operation with validated byte ranges and bounded free retries. The first live draft lacked calibration metadata and was correctly blocked.

There is one active generation and three submissions per room, plus a durable deployment-wide cap (default three). The user authorized exactly one additional generation for this pass: the private local limit is now four and all four reservations are used. The new courtyard operation reports exactly 1,580 credits; it was not resubmitted during download recovery. Reopening cached worlds costs no generation credits. A further funded run needs a deliberate operator change to WORLD_LABS_GENERATION_LIMIT; nothing raises it automatically. This is not a guaranteed dollar cap.

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
