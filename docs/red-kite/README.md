# The Red Kite

A fictional childhood afternoon in the foothills of California's Central Coast. Elena, 58, and her childhood friend Rosa each share what they remember about flying a kite together. A younger relative can explore the same afternoon through either telling, including each person's spatial viewpoint, words and uncertain details.

The creative direction is **one shared place, two personal perspectives, one meaningful shared object**. Make the visitor care about the people and their red paper kite before adding more scenery or mechanics. The backdrop must hold together from both the open path and beside the oak, looking back across the clearing.

![Proposed final-state art direction](references/completed-scene-concept.png)

This image is original AI-authored concept art, not a screenshot of working VR or a historical reconstruction. Its kite, string, table and box illustrate the intended separate 3D assets. Only the empty meadow reference was submitted to World Labs.

## Start here

- [Scene, story, exact demo beats and design decisions](SCENE_DIRECTION.md)
- [Detailed teammate / autonomous-agent asset brief](TEAMMATE_ASSET_BRIEF.md)
- [Interactive 2D concept rehearsal](rehearsal.html)
- [What was actually evaluated and what remains unverified](EVALUATION.md)
- [World Labs request, model, approval and source hash](world-request-plan.json)
- [Preferred art prompt for a future deliberately configured request](WORLD_LABS_PROMPT.txt)
- [Original image prompts and provenance](references/IMAGE_PROMPTS.md)

To view the rehearsal, serve this repository directory and open the HTML through HTTP. For example, run `python3 -m http.server 4187 --bind 127.0.0.1 --directory docs/red-kite` from the repository root, then open `http://127.0.0.1:4187/rehearsal.html`. This is an isolated concept tool; it does not modify rooms or invoke providers.

To open the actual cached 3D meadow in the existing app, run `npm run demo:kite` from the repository root after local Convex is running. This verifies the cached file hashes, uploads only if needed, and creates or reuses a fictional demo room. It prints a spectator link and saves privileged session details in the ignored `.logs/red-kite-demo-room.json`. It does not invoke World Labs or change live service flags. Deploy the current Convex functions first if your backend does not yet accept `setting: 'red-kite'` in `splats.usePracticeWorld`. The older default courtyard route remains available.

## What each part does

| Part | Responsibility |
| --- | --- |
| World Labs Marble 1.1 | Generate the continuous meadow surroundings from the empty reference image. |
| Spark in the existing client | Render the cached SPZ with provider coordinates. This package verifies the IWSDK fallback; the new Gate journey has a separate React Three renderer. |
| Blender, exported GLB assets | Supply the separate kite, spool, box, story card and small support table. |
| The existing server and story contract | Keep the source words, proposal, human illustration choice and revision together. New kite/color/ribbon support still needs explicit integration. |
| A small runtime module | Animate the kite and ribbon, draw the string, manage local grabbing and docking, and obey pause. |
| Phone and spectator views | Make the source and illustration choice easy to see without wearing the headset. |

The current 2D rehearsal demonstrates Elena's illustration-choice sequence. It does not yet implement the second telling or a 3D perspective switch. The teammate brief now includes that core requirement alongside the missing XR interactions. The cached world's existing forward-view evidence does not establish its reverse-view quality.

The team's newer `apps/gate` portal/companion/album client is preserved alongside `apps/headset`. Prefer integrating the finished Red Kite journey into Gate, with portable GLBs and a small client-specific adapter. Keep the currently verified IWSDK world as a fallback, and do not mix the clients' different Three versions. The brief now covers this boundary explicitly.

## Product promise

“Step into the same memory through the people who shared it.”

For the younger-onset Alzheimer's direction, the design is a person-led shared reminiscence experience. We have no evidence that this prototype diagnoses, treats or restores memory. We will not turn a missing detail into a failure, a progress score or a requirement to continue.
