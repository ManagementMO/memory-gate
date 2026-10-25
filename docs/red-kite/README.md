# The Red Kite

A fictional childhood afternoon in the foothills of California's Central Coast. Elena, 58, and her childhood friend Rosa each share what they remember about flying a kite together. A younger relative can explore the same afternoon through either telling, including each person's spatial viewpoint, words and uncertain details.

The creative direction is **one shared place, two personal perspectives, one meaningful shared object**. Make the visitor care about the people and their red paper kite before adding more scenery or mechanics. The backdrop must hold together from both the open path and beside the oak, looking back across the clearing.

![Proposed final-state art direction](references/completed-scene-concept.png)

This image is original AI-authored concept art, not a screenshot of working VR or a historical reconstruction. Its kite, string, table and box illustrate the intended separate 3D assets. Only the empty meadow reference was submitted to World Labs.

## Start here

- [Current working-app handoff and parallel teammate assignments](TEAM_HANDOFF.md)
- [Scene, story, exact demo beats and design decisions](SCENE_DIRECTION.md)
- [Detailed teammate / autonomous-agent asset brief](TEAMMATE_ASSET_BRIEF.md)
- [Interactive 2D concept rehearsal](rehearsal.html)
- [What was actually evaluated and what remains unverified](EVALUATION.md)
- [World Labs request, model, approval and source hash](world-request-plan.json)
- [Preferred art prompt for a future deliberately configured request](WORLD_LABS_PROMPT.txt)
- [Original image prompts and provenance](references/IMAGE_PROMPTS.md)

To view the rehearsal, serve this repository directory and open the HTML through HTTP. For example, run `python3 -m http.server 4187 --bind 127.0.0.1 --directory docs/red-kite` from the repository root, then open `http://127.0.0.1:4187/rehearsal.html`. This is an isolated concept tool; it does not modify rooms or invoke providers.

To seed the cached meadow and prepare the reusable fixture, run `npm run demo:kite` from the repository root after local Convex is running. It verifies file hashes, uploads only if needed, and prepares both tellings. It prints Gate and fallback viewer links and keeps privileged session details in ignored `.logs/red-kite-demo-room.json`. Open `https://localhost:5180/?story=red-kite` for a browser-owned interactive host sample. The script never invokes World Labs or changes live service flags. Use the current Convex functions; the older default courtyard route remains available.

## What each part does

| Part | Responsibility |
| --- | --- |
| World Labs Marble 1.1 | Generate the continuous meadow surroundings from the empty reference image. |
| Spark in Gate | Render the cached SPZ with provider coordinates, two checked viewpoints and stereo. IWSDK remains a separate fallback. |
| Blender, exported GLB assets | Supply the separate kite, spool, box, story card and small support table. |
| Convex and the shared story contract | Store separate Elena/Rosa sources, playheads, revisions and human illustration choices. Unknowns and disagreements survive switches. |
| A small runtime module | Animate the kite and ribbon, draw the string, manage local grabbing and docking, and obey pause. |
| Phone and spectator views | Make the source and illustration choice easy to see without wearing the headset. |

The actual Gate app now implements both perspectives, original Blender props, source choices, a scene-space fade, dynamic string/ribbon, pointer capture and native controller squeeze. Open `https://localhost:5180/?story=red-kite` or choose “Explore The Red Kite · two tellings” at the portal. The full 500k meadow is the default; the visibly rougher 100k export is an explicit fallback. The old 2D rehearsal remains a concept tool. Physical Quest comfort/performance and real family speech remain the next evaluation gates.

The team's `apps/gate` portal/companion/album client is preserved alongside `apps/headset`. Red Kite is integrated into Gate with portable GLBs and a dedicated adapter. Keep IWSDK as a separate fallback and do not mix the clients' different Three versions. The handoff and brief document this boundary.

## Product promise

“Step into the same memory through the people who shared it.”

For the younger-onset Alzheimer's direction, the design is a person-led shared reminiscence experience. We have no evidence that this prototype diagnoses, treats or restores memory. We will not turn a missing detail into a failure, a progress score or a requirement to continue.
