# The Red Kite: scene and experience direction

## The story we are making

Elena is a fictional 58-year-old grandmother. She recalls an afternoon with her childhood friend Rosa in a meadow in California's Central Coast foothills. If a year is needed for the fictional script, use 1978, when she was about ten. Neither the place nor the people are represented as a verified family history.

The memory is small: a winding path, an oak, a kite, a ribbon and two friends who did not want to go home. There is no quest, no puzzle to solve and no reconstructed child avatar. The person wearing the headset is a visitor to the telling, not a forced first-person impersonation of a child.

The emotional line is: **“I don't remember every detail. I remember who I was with.”** A detail can arrive later, remain uncertain or never be filled in. All three outcomes are acceptable.

## The look

Use the selected empty meadow as the environmental reference. The oak sits in the right middle distance. The path curves to the left. A level near clearing leaves room for reachable props. Sage green, warm dry grass, dusty earth, muted blue and warm wood carry the scene. The matte red kite is the strongest color accent.

The target is richly crafted naturalism with restrained painterly simplification: believable materials, rounded forms, soft directional light and convincing scale. Avoid both generic low-poly assets and a collage of unrelated photoreal models. The hero concept supplies composition and material direction; it does not substitute for a headset render.

| Layer | Content | Motion |
| --- | --- | --- |
| Far / middle | World Labs meadow, oak, hills, winding path and sky | Static geometry and stable horizon. |
| Near | Small table, spool, box and story card, authored in Blender | Physical object interactions only. |
| Above the path | Separate kite, frame, ribbon and dynamic string | Gentle local wind-driven motion. |
| Ground detail, if time permits | A few authored grass/poppy clusters matching the world | Low-amplitude sway outside the interaction clearing. |
| Audio | Storyteller's own words; optional quiet meadow ambience | Voice has priority, immediate pause, no startling effects. |

World Labs does not supply the kite's grab behavior, the source linkage, arbitrary editable splats or a complete game. Those are application and asset responsibilities.

## What “gaps” mean visually

The environment never becomes damaged or unsafe because the narrator is uncertain. No black voids in the ground, crumbling world, frightening shadows or “memory restored” meter.

An **asserted object with an unknown attribute** may appear as a modest, neutral illustration proposal. A kite can exist while its color is open. A small incomplete pencil-like edge or neutral paper finish conveys an unfinished depiction without making the whole place disappear. In actual VR, use a stable outline or material treatment; avoid flickering transparency and dense overlapping alpha.

An **uncertain object identity** is different. “I don't remember whether we brought a kite” does not authorize creating a kite. Keep the field as it is. The family can continue the conversation without an illustration.

When a new detail is offered, preserve its source and show a proposed depiction. The explicit choice is **“Use this look.”** Choosing it accepts an illustration, not historical truth. Confidence in speech recognition or a model's JSON is not evidence that a remembered detail is correct. Keep rejected, superseded and uncertain alternatives distinguishable from the current depiction.

The Alzheimer's Association describes reminiscence as a way to share experiences and emphasizes connection rather than testing memory. We apply that as a design principle, without claiming clinical benefit for this prototype. [Reminiscence guidance](https://www.alz.org/help-support/caregiving/daily-care/reminiscence-and-reminiscence-therapy).

## The two-minute demonstration

These are fictional performance lines, not a real participant's recording. Live delivery can vary. The operator should wait for the narrator; the times below are rehearsal targets, not a timer imposed on a person.

| Time | Spoken line | Operator / visitor action | What the audience sees |
| --- | --- | --- | --- |
| 0–15 s | Presenter: “This is a fictional story rehearsal. Elena is sharing a childhood afternoon with her family.” | Start with the world already cached and visible. Wearer is seated or comfortably stationary. | Quiet meadow, clear horizon and oak; no loading lottery. |
| 15–35 s | Elena: “Rosa and I used to run down that little path. There was an old oak at the bend.” | Let the narrator finish. Do not move the viewer or animate a camera run. | Composition carries the story. Spectator view shows these exact words as a source. |
| 35–55 s | Elena: “We had a kite. I can't remember its color.” | Present the neutral kite illustration as a proposal. Leave color open. | A small unfinished kite depiction; no automatic red and no claim of a recovered detail. |
| 55–75 s | Elena: “It was red. Rosa tied a cream ribbon to the tail.” | Source-linked color/ribbon proposal appears on the phone. Family chooses “Use this look.” | Kite paper becomes red; cream ribbon takes its authored form. The spectator can see which words led to the choice. |
| 75–100 s | Younger relative: “Can I try?” Elena: “Lift the spool a little. That's it.” | Visitor squeezes and gently lifts the reachable wooden spool, or uses the seated accessible alternative. | Kite rises a little into the breeze, ribbon follows, string curves naturally. No change to the headset camera. |
| 100–120 s | Elena: “I don't remember what we did after. I remember we didn't want to go home.” | Return spool to its dock. Select the source card and replay the saved original line, if consented recording exists. | The kite remains aloft. A small story artifact contains the chosen depiction and source words. |

If no original audio exists, show the transcript or clearly identify synthetic sample playback. Never label browser speech synthesis or TTS as Elena's recorded voice. A successful demo ends with a shared story, not a completion score.

## The interaction that must feel good

Build one tactile moment exceptionally well. The spool should sit close enough to reach, have a visibly comfortable grip, attach naturally to the hand and return to a stable dock when released. Its lift produces a small, smooth change in the kite's target height and ribbon movement. A lightweight procedural spring is enough; full cloth simulation and unconstrained rope physics are unnecessary.

The IWSDK fallback uses the right trigger for push-to-talk; the newer Gate client has its own voice flow and a global tap/trigger “look here” action. Use the selected client's native proximity grab for the spool, preferably squeeze on controllers, with explicit input ownership so a grab does not also talk or broadcast a point. Pinch support is an additional integration decision, not an assumption about the pinned IWSDK version. Provide a button-based lift alternative for someone who cannot comfortably reach or hold a controller.

Pause must stop motion and playback immediately, release or safely dock the locally held object, and preserve the story state. Resume starts gently. The app never requires physical running, leaning over furniture or chasing a flying object.

Use an unhurried 0.8–1.2 second color arrival after illustration acceptance. A roughly 0.5–0.8 second dock return can feel soft without becoming sluggish. These are art targets to evaluate on the actual device, not measured comfort guarantees. Reduced-motion mode uses minimal travel and a stable kite pose.

## Why this is distinctive

The visual spectacle has a clear human cause. A particular line proposes a detail; a person chooses it; a physical object makes that illustration tangible; selecting it returns to the voice that inspired it. It is possible to point to every link in that chain.

The red kite is recognizable from across the judging area. The oak, path and quiet sky make it legible instead of competing with it. The live demonstration can prove source linkage, choice and interaction in minutes while the expensive world generation remains cached.

The “unfinished” treatment is part of the illustration workflow. It does not pretend to visualize the person's brain or reveal whether an uncertain recollection is true. Younger-onset Alzheimer's is the intended use context, not a costume or a dramatic failure state assigned to a participant.

## Technology and integration

The generated meadow is cached and checked in the existing IWSDK 1.0.1 / Spark 2.4 fallback. The team's newer Gate journey uses React Three Fiber / React Three XR and a separate Three version. Prefer Gate for the finished portal-to-story-to-album experience; preserve the verified fallback and make the Blender assets portable. Keep a small framework-independent behavior core with one native adapter for the chosen client. Do not pass Three objects between the two bundles or rewrite the team's portal and companion.

The one approved private Marble 1.1 world used the **empty** regular perspective reference; both 500k and 100k SPZ variants are now cached. Respect provider scale, orientation and floor metadata. Complete-world rendering must preserve distant sky/hills and use an adequate far plane; this meadow has splat centers beyond 267 m. World Labs explicitly documents engine integration and coordinate handling; do not visually “fix” scale with arbitrary camera offsets. [SPZ rendering guidance](https://docs.worldlabs.ai/api/rendering-spz).

The existing backend already handles room membership, source utterances, proposals, human confirmation, revisions and vendor jobs. It does **not** yet implement the full red-kite noun/attribute/state flow. Extend the shared allowed vocabulary and validation, add tested attribute proposals with source ownership and revision checks, then route the resulting authoritative illustration state into the isolated kite runtime. The asset teammate should not reinvent that backend.

Important distinction: existing library `size` means the largest model dimension, and the object layer rescales the model to it. The kite's ribbon changes its complete bounding box. Record full rest-pose bounds and explicit sail size, or the supposedly adult-scale kite will be unexpectedly tiny. A grab collider and a color-changing material also need explicit runtime wiring; named nodes alone do not implement behavior.

## Scope and order

1. Evaluate the actual generated meadow in the existing renderer: look ahead, to both sides, behind and down. Find a stable seated/standing viewing region and verify scale before placing assets.
2. Deliver the Blender kite and spool first, with correct nodes, pivots, materials and GLB validation. Context renders must look good against this meadow.
3. Wire one actual grab/lift/dock interaction in the selected client, preferably the team's Gate journey. Preserve the working IWSDK fallback and verify the chosen adapter on a physical Quest 3 when available.
4. Integrate the source-linked neutral → proposed details → chosen illustration sequence and its spectator explanation. Check unknown and uncertain cases.
5. Add the box and card as a persistent, replayable artifact. Add quiet ambience and sparse grass motion only after the core loop works.
6. Rehearse two devices, reconnect, pause, original-audio cancellation and a predictable reset. Record a short backup with the same honest labels.

The field, reference concept and 2D rehearsal can be evaluated now. Physical Quest comfort, native grabbing, real family audio, multilingual recognition and the complete red-kite server path remain separate verification gates. See the dated evaluation record for actual results.
