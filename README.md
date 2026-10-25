# Memora

## Inspiration

Dementia slowly makes a family's stories harder to reach. The people living with it are often the grandparents, parents and partners who remember where everyone came from. As those stories fade, photo albums stay flat, and a conversation can slip into quizzing: "Do you remember...?"

We noticed that a memory never belongs to one person. A grandmother and her grandson remember the same afternoon from different heights, in different words, with different details. We wanted a place where a family could step into a memory together, each through their own eyes. The person telling it would set the pace, and nothing they said would be marked wrong.

## What it does

Memora is a shared reminiscence space that runs in the browser on a laptop, a phone or a Meta Quest 3.

### A companion at the gate

A marble figure greets you, and you simply talk. The microphone is hands-free and waits patiently through long pauses. You can also share a photo or a video, or invite someone to join. The companion never quizzes, corrects or diagnoses. It says one short line at a time and lets the person lead.

### Words become a place

From your words or a photo, World Labs builds a 3D world you can walk through. When you mention a detail ("there was a wooden bench by the tree"), a golden suggestion of that object appears. The family reviews it together, and confirming it makes it solid. Selecting the object later plays back the original sentence in the voice of the person who said it.

### Two perspectives, one memory

In our sample memory, The Red Kite, a grandparent and grandchild walk the same California meadow at their own eye heights. Each appears as a full-size walking person, and each can see the other across the meadow. The visit stays in sync between a laptop and a headset.

### Real-world context

Our Apify Actor, Source Atlas, finds public historical photos from the Library of Congress, nearby places on Google Maps and family-approved Instagram posts. A family can attach one of these to a kite, a flower or a landmark, with its attribution kept. They can also preview a 3D object and place it in the memory. Nothing is added unless someone approves it.

### An album on a world map

Moments are saved to an album, and each memory sits at its place on a world map. The My memories tab holds your own, and World memories shows memories other people have chosen to share publicly. Each memory is private by default.

### Built around care

You can pause at any moment. There's a simpler storyteller view and highly legible type. Uncertain recall stays part of the conversation instead of becoming scene "evidence." Recordings need consent, and a child's likeness needs a guardian's agreement.

## How we built it

### Client

A single web app built with React 19, Vite and TypeScript. The 3D scenes use Three.js, React Three Fiber and WebXR, so the same code runs on a laptop, a phone and a Quest 3. A separate headset client uses Meta's Immersive Web SDK.

### Worlds

World Labs Marble generates each environment as a Gaussian splat, rendered with Spark. Interactive objects are separate GLB models, built in Blender and placed on top of the world, because the splat itself can't be edited.

### People

The grandparent and grandchild are rigged MakeHuman characters (MPFB 2 in Blender) with walking animations. They move with laptop keys, the Quest thumbstick or real steps, and Rapier handles collision against the meadow.

### Voice and language

Cartesia Ink-2 transcribes speech and Cartesia Sonic speaks the companion's lines. Claude (Anthropic SDK) interprets narration into structured suggestions. Claude only proposes: deterministic code decides what a reply can do, checks every placement for valid bounds, clearance and direction, and filters every reply for safety.

### State

Convex holds rooms, permissions, object placements, revisions, undo, media and background jobs. SpacetimeDB, behind an authenticated Node WebSocket gateway, holds the real-time shared layer: presence, perspectives, the memory exchange between participants and the archive references a family chooses together.

### Sources

Source Atlas is a custom Apify Actor that wraps the Library of Congress catalog, the Google Maps crawler and Instagram post import. Each source mode has its own limits on results, time and cost. Tripo image-to-3D is available for photos a family has explicitly consented to.

### Map

D3-geo and TopoJSON draw the world map.

### Testing

Playwright browser tests (including two people in one session), Vitest, convex-test and the IWSDK headset emulator.

## Challenges we ran into

### A static world with live objects in it

A Gaussian splat can't be edited, so every object a family adds is a separate model. Lining those up was tricky: the meadow's collision mesh sat about 1.15 m below the visible ground, so we had to lift it until people walked on the grass instead of under it.

### Two incompatible versions of Three.js

The headset SDK depends on its own fork of Three.js, while our main client uses standard React Three Fiber. We kept the two clients separate rather than forcing them to share code.

### Two people in sync

We had to keep a grandparent on a Quest and a grandchild on a laptop seeing the same memory at different eye heights, each with the other's avatar in the right place. That meant scaling the XR origin per perspective and keeping presence in sync in real time.

### Hands-free voice for someone who pauses

People with memory loss often stop mid-thought. We had to tune turn-taking so the companion waits for the person to finish rather than cutting in.

### Paid world generation

Each World Labs world costs about 1,580 credits and takes minutes to generate. We added per-room and deployment-wide caps, reused existing jobs, made interrupted downloads resumable, and cached prepared worlds so a demo never waits on a generation.

### Privacy at every boundary

Original audio is never sent to World Labs. Apify never receives family recordings or transcripts. Search results can't change a shared scene unless a person approves it.

### Testing VR without always having a headset

We relied heavily on the IWSDK emulator and kept careful track of what had been tested in the emulator and what still needed physical Quest testing.

## Accomplishments that we're proud of

- The full loop works: someone says a sentence, a golden suggestion appears, the family confirms it, and the object later replays that person's own voice. Every object traces back to the words that made it and to who said them.
- Two people can share one memory through different eyes, live, across a laptop and a headset.
- We verified the live Apify flow end to end: a real Google Maps search, family approval, an optional 3D model and a source card shown in stereo VR.
- The same app runs on a phone, a laptop and a Quest 3.

## What we learned

- Designing for memory loss means designing for presence, not accuracy. An uncertain detail is part of the story, not an error to fix.
- Letting the LLM propose and code decide made the AI both useful and safe. Bounded intents and deterministic validation removed a whole class of failures.
- Splat worlds look photoreal, but interaction needs real geometry, so generated scenery and handmade objects work best side by side.
- How to divide work between databases: Convex for transactional, permissioned state, and SpacetimeDB reducers and subscriptions for fast shared presence.
- Consent works better as part of the flow than as a checkbox: per-recording permission, guardian approval for minors' likenesses, and "stop sharing" that takes effect within seconds.

## What's next for Memora

### Testing with real families and care partners

We want to test comfort and performance on a physical Quest 3, then run sessions with consenting families, with input from caregivers and clinicians.

### One shared conversation

The companion will talk with the grandparent and grandchild together, using both microphones and addressing each person by name.

### Multilingual memories

Automatic language detection, building on the English/Spanish spatial commands we already support.

### Real sharing on the world map

Public memories that sync across devices instead of staying on one device, plus more world memories, starting with The proposal on the hill in San Francisco.

### Richer in-world sources

Bringing reviewed archive photos and places directly into the 3D memory, and making it easier to build a likeness from a family's own photos.

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
