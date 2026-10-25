# Object exploration in the main memory

This is an additive HUD in the existing `/` journey, including the prepared Red Kite meadow. It does not replace the welcome, companion, captions, social dock, walking, viewpoints, terrain, splat renderer, or controller bindings.

The welcome now has a secondary **Explore the meadow** option with the same glass controls and small `via Apify` credit. It opens the existing sample through the prepared-place flow with the kite and spool already present. Its label explicitly calls this fictional. Begin still starts the companion conversation, invitation links keep Join, and the existing source/3D examples remain available. Nothing is scraped on the welcome screen. In the meadow, the same markers and cards appear in desktop and native VR.

For an immediate comparison or a hardware fallback, append `&objectInfo=off` to the meadow URL. This disables both add-on components, their queries and markers, without changing any configuration file. The default is enabled. Optional information has its own error boundaries, so an unavailable source does not replace the memory.

## More from Apify (Source Atlas 1.4)

**Every thing has a card with real words.** Each of the scene library's 108 kinds has a topic, along with the meadow's own things: kite, flowers, the old oak, the path, the golden hills, the meadow, picnic and bench. The meadow's things draw on several fixed sources:
- NASA;
- the Royal Horticultural Society;
- the USDA Forest Service;
- the National Park Service;
- Wikipedia.

Every other kind has its own Wikipedia article. A card shows:
- the first passage, with its source;
- up to two more sources' passages;
- up to three old photos from the Library of Congress. A photo is kept only when its record says it is free to publish (public domain, or no known restrictions).

Sources other than Wikipedia and U.S. government pages stay a brief quotation of 24 words. Wikipedia (CC BY-SA) may give up to 60 words, and U.S. government pages up to 50.

**Never "unavailable".** One Apify batch run over every topic is kept in `apps/gate/src/object-info/saved-references.json`. The latest run covered all 111 topics, with 75 archive photos, for about $0.012. A card shows that saved copy at once, and a live lookup replaces it when one finishes. The saved copy is also what a card shows when a live lookup can't run: offline rooms, no Apify connection, or a failed run. Refresh the saved copy with `node scripts/atlas-snapshot.mjs [topic …]`. It merges into the saved copy, so refreshing a few topics keeps the rest.

**Things people name are shaped by what Apify found** (`object-info/inspiration.ts`). Say "oh, and this big daisy was there" in the meadow:
- The daisy is recognised from the references, because the RHS "common daisy" page names it, even though the scene library only knows "daisies".
- It comes in at one of the meadow's flower spots, white with a yellow centre, because the RHS describes "yellow-centred … white daisies".
- It is 1.45× its usual size, because they said "big".
- It is labelled "Daisy". The person's own word is used, never a species they didn't name; "valley oak" is used only if they said it.
- Its card opens on the description it was shaped from.

The words a person says always win: "orange poppies" stay orange. Only a thing's own name shapes it, so "the kite had a long line" leaves the kite a kite. A word is recognised only when it is said as a thing ("a…", "this big…", "white…") and is what a reference is named for, so "we walked to school" adds nothing.

The shaping happens on the device, from references already retrieved. Nothing anyone says is sent to Apify.

The meadow now has more spots, for flowers, a ball, a basket, a dog, a bush and a rock, and more Explore markers: the path, the golden hills, and the oak as its own topic. Up to four markers show at once.

**The batch is gentle with the Library of Congress.** It waits 2.5 s between archive requests, and stops asking for photos if the archive ever replies 429. A 429 can block an address for about an hour. The meadow's own topics run first, so they get their photos before any limit is reached. Wikipedia passages come twenty to a request.

## Keep the main pipeline independent

`memory-addons/MemoryAddOns.tsx` composes the existing source/object workflow with discovery at the two existing attachment points: screen UI and native scene UI. Both components return fragments and preserve their original order. Add a future external feature's screen and VR components there; it need not replace the companion, planner, uploaded-photo flow, POV collaboration, or album.

`object-info/targets.ts` is a read-only snapshot adapter. `object-info/sceneHints.ts` holds the authored flower/tree hints for the checked meadow. Existing model objects, current-POV objects and reviewed optional props are still supported. Other POVs' ghosts and other memories are filtered out. The native flower card explicitly labels daisies as a flower example with no species identification.

When a supported rendered object has formed and is visible, a small `Explore · Apify` marker appears beside it. Select the marker to retrieve a short public explanation. A corner card shows the excerpt, publisher, original source link and small `via Apify` credit. The headset renders actual Three.js markers and a native card; it does not depend on a DOM overlay in immersive mode. Trigger/pinch selects the marker; Back dismisses its card. Existing A/B/X/Y/menu and movement controls retain their behavior.

Topics: every scene library kind and the meadow's own things (see above). Scene metadata supplies the topic. The prepared meadow also has authored semantic hotspots for its baked scenery: flowers beside the path, the old oak, the path and the golden hills. These appear only when that checked meadow's world ID is active. A generic flower uses daisies as a labeled example; it does not identify the model or scenery as a real species. Arbitrary background splats without this metadata are not treated as recognized objects. New supported objects from the current perspective and approved optional props receive markers too. Other perspectives' ghost objects do not receive this HUD's markers.

Only selecting a marker starts retrieval. The frontend calls authenticated Convex actions, which atomically reserve one topic job per room, start the existing private Source Atlas Actor with `sourceMode: object`, and poll its saved run/dataset. The Actor retrieves bounded pages from fixed URLs, fixed Wikipedia articles and fixed Library of Congress photo searches, and returns attributed excerpts and photos. No family story, photo, memory identifier or personal address is sent to Apify. The server checks citations again against the topic allowlist before publication.

No new API key is needed. The existing private `APIFY_TOKEN`, `ALLOW_APIFY_CLOUD=1` and `APIFY_MEMORY_ACTOR_ID` must be pushed with `npm run env:push`. Deploy Actor version 1.4 with `npm run deploy:atlas` before trying the HUD. Each object lookup has a 90-second timeout and a $0.10 maximum request charge; no Maps/Instagram child Actor is used for these topics. Merely seeing an object makes no paid call. Repeated clicks/devices reuse the same saved job. Previously retrieved public references can be reused across rooms for seven days, including offline rooms. Offline rooms without a cached topic cannot start paid requests. Uncertain starts are recorded and never automatically retried.

Object information is public context, separate from a person's recollection. This addition does not change or generate any memory details or rewrite the person's words. Leaving, switching perspective, resting or opening the existing source/story panel closes the info card.

Validation: `npm run test:atlas`, `npm test -- tests/smoke/object-knowledge.test.ts`, Gate typecheck/build, and `node apps/gate/scripts/object-info-check.mjs --live` (explicitly enables bounded Apify retrieval). Browser evidence and live run IDs are recorded separately after verification. Physical Quest testing is still required before claiming headset hardware verification.

Use `node apps/gate/scripts/object-info-check.mjs --live --from-home` to verify the new welcome entry, three responsive layouts with no overlapping controls, invitation/nearby states, and the complete desktop-to-native discovery flow. The final run passed all ten checks with zero page errors, reusing the existing saved NASA, RHS and Minnesota DNR references. Gate typecheck/build, 139 contract tests and 16 Actor tests also pass. [Sanitized results and current home screenshots](../evidence/object-exploration/home-to-headset.json).

## Verified local run

Latest main `e78e720` is fully included in `codex/apify-memory-lens`; a fresh fetch/merge reports already up to date. The separated add-on passes all 139 contract tests, including five read-only/POV/hint isolation cases, Gate typecheck and production build. The six main-journey browser/native XR checks were rerun after this separation with zero page errors: existing view/dock, live citation, repeated-selection run reuse, POV/rest cleanup, real controller-ray selection/details/back, and native flower/tree retrieval. These use stereo Meta Quest 3 emulation and reused the saved real Apify citations without new Actor runs. See [actual screenshots and sanitized run IDs](../evidence/object-exploration/verification.json). The unchanged Actor previously passed its 16 tests.

The existing main source/object workflow also passes three browser/native XR checks with `objectInfo=off`: review and placement, POV isolation, and the source card in an actual immersive session. This confirms disabling discovery retains the earlier add-on. See [add-on isolation verification](../evidence/object-exploration/add-on-isolation.json).

The private Actor's corrected extraction prefers explanatory sentences and rejects synonym-only lists. Its public-reference cache format is versioned; an explicit selection can replace an older completed extraction. Running or uncertain jobs are never restarted automatically. The local SpacetimeDB module was brought to the pulled main code (which updates the two new avatars' eye heights) without changing configuration or deleting data.

The broader team walking check confirms correct avatars, eye height, all movement directions, reset, typing isolation and stopping, but still fails three displacement/speed/animation thresholds in the headless run. This result is recorded in `evidence/object-exploration/walking-check.json`; its cause has not been fully isolated. Production walking code was not changed for the HUD. Do not treat the successful six add-on checks as a full hardware or locomotion-performance certification.
