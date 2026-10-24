# The Red Kite: evaluation and remaining work

Evaluated October 24, 2026. This record separates original concept art, a real World Labs generation, actual browser behavior and work not yet implemented.

During delivery, 19 newer team commits through `5ba599f` arrived on `origin/main`, adding `apps/gate` and related backend/presence work. They are preserved in the merge. This scene package's visual evidence is from `apps/headset`; it does not establish the new meadow's rendering or interaction quality in Gate. The teammate brief now prefers Gate for the finished journey while keeping GLBs and behavior portable.

The user subsequently clarified that viewing the same memory through different people's perspectives is the core idea. The storyline, future backdrop prompt and teammate brief now require two attributed tellings and two spatially coherent viewpoints. This is a design update; no additional World Labs generation was submitted, and the existing captures and browser tests do not establish that feature.

## What exists

| Deliverable | Result / evidence |
| --- | --- |
| Original empty-meadow reference | Generated and revised once to make the near clearing less rocky and more usable. Both image prompts are recorded. The selected JPEG hash is in the generation manifest. |
| Final-state prop composition | Original concept image with a red kite, ribbon, spool, side table and keepsake. This is art direction, not implemented VR. |
| World Labs meadow | One approved Marble 1.1 image generation completed in 618,496 ms, about 10 min 19 s. The durable job reports one attempt. Both bounded SPZ variants and a provider preview are cached. |
| Cached-world reuse | `npm run demo:kite` seeds only cached files and creates/reopens a fictional room. A repeated live run returned `reused: true`. No generation endpoint or global service-flag mutation is in this script. |
| Existing IWSDK runtime | Actual full 500k meadow rendered through the managed browser, with provider-derived eye height ~1.525 m and spectator FOV 78°. The final check reported no app or tick error. This was desktop spectator rendering, not physical Quest proof. |
| 2D story rehearsal | Real browser buttons and pointer input exercised the unknown → proposed → chosen illustration flow, lift/dock, pause, sample speech cancellation and responsive layout. See `rehearsal-check.json`. |
| Teammate assignment | Detailed original-model specifications, Blender build path, export/manifest contract, runtime API, interaction ownership, validation and handoff requirements. |
| Multiple personal perspectives | Specified for Elena and Rosa, including separate source-linked details, local viewpoint selection and preserved disagreements. Not yet implemented or visually verified. |

## The actual world versus the reference

The provider result has convincing warm light, layered meadow depth, a worn path and a readable oak silhouette. It also adds a very large nearby oak on the left, rather than reproducing the reference's single dominant right-side tree. The candidate remains useful as a fictional setting, but this is a compositional departure. We should place the kite in open sky and keep reachable props away from the large trunk.

The revised reference gives a stronger interaction clearing than the original rocky foreground. A requested four-meter clearing in an image prompt is not a measured flat collision surface. The actual scene needs near-ground inspection, seated reach calibration and a physical Quest check before final object placement. It also needs inspection from the oak-side viewpoint looking back across the clearing, including newly exposed surfaces and peripheral coverage. The current evidence covers a fixed forward view only. The backdrop remains a candidate until both intended perspectives work; prompting alone is not a multi-view quality guarantee.

This generation is accepted as a **candidate environment foundation**. It is not evidence of a fully navigable game, an exact historical place or clinical benefit. The intended experience stays stationary; arbitrary walking around generated geometry is outside this acceptance.

## Rendering defects found and repaired

The first actual runtime capture exposed large black gaps even though the provider preview looked coherent. Two independent authored limits caused the problem:

1. The photo reconstruction shader faded scenery between 28 and 36 metric meters and ended its reveal near 38 m. Complete World Labs scenes now bypass that radial window, retaining their distant landscape and sky. Their existing load cross-fade remains. Photo reconstructions retain their prior bounded treatment.
2. The camera's far plane was 200 m. Offline inspection of the actual cached SPZ v2 found 1,081 forward centers beyond 200 m, with a maximum forward depth of ~267.139 m and a maximum center radius of ~410.661 m. World Labs scenes now use a 1,000 m far plane; photo/fallback scenes remain at 200 m. The near plane, metric alignment and framebuffer scale were not changed.

The final same-view capture shows the restored sky and hills without those black cutouts. This is a verified presentation correction for the inspected view; it is not a claim that every angle or small head movement is artifact-free.

| Capture | Meaning |
| --- | --- |
| `references/world-runtime.png` | Initial actual app render with the radial-distance problem. |
| `references/world-runtime-after.png` | Radial fading removed; right-side far-plane clipping still visible. |
| `references/world-runtime-final.png` | Final actual app render after both corrections. |
| `references/rehearsal-chosen.png` | Actual 2D concept rehearsal after accepting the fictional red/cream depiction and lifting the spool. |
| `references/completed-scene-concept.png` | Proposed artistic target only. |

The existing spectator source card takes substantial space at a small browser viewport. A quieter, shorter final demo caption is still worthwhile after the object loop is integrated. We did not replace the shared interface as part of this art-direction task.

## Verification results

- Root TypeScript check passed.
- Headset TypeScript check and production build passed after the rendering changes.
- After merging the team's work, the Gate TypeScript check and production build also passed. Gate now shares the World Labs camera-distance policy. These checks establish compilation, not a visual or native-interaction pass for this meadow in Gate.
- Eleven focused backend tests passed across the World Labs and new cached-meadow suites, including authorization, explicit sample mode, reuse, no paid-job creation, pause and preserving the default courtyard selection.
- Twelve headset tests passed, including full-world versus photo presentation, camera distance policy and existing room-switch/load/pause regressions.
- Seven actual-browser rehearsal checks passed with no page errors or external service requests. These are grouped behavioral checks, not a claim of seven native XR tests.
- The current cached-world script was run twice against local Convex and reused the room/selection. Source hashes were checked before uploads.
- A local managed-browser rendering check loaded the actual 500k source successfully with no reported app/tick error.

The IWSDK production build still reports the existing large JavaScript chunk (~9.46 MB, ~2.68 MB gzip) and dependency comment warnings. Gate's build also warns about a ~3.06 MB scene chunk (~1.07 MB gzip); the apps have different chunk layouts, so those numbers are not a total-size or runtime-performance comparison. Both builds pass, but bundle size and real-device performance remain engineering work. No physical Quest frame-rate or comfort claim is made.

Useful commands from the repository root:

```sh
npm run typecheck
npm test -- tests/smoke/red-kite-world.test.ts tests/smoke/worldlabs.test.ts
npm run test:headset
npm --prefix apps/headset run typecheck
npm --prefix apps/headset run build
npm run demo:kite
python3 -m http.server 4187 --bind 127.0.0.1 --directory docs/red-kite
# In another terminal, with that local rehearsal server running:
node scripts/check-red-kite-rehearsal.mjs
```

The managed-browser world check is `node node_modules/@iwsdk/cli/bin/iwsdk.js browser run scripts/red-kite-world-check.mjs --timeout 60000` from `apps/headset`, with its existing managed runtime running and the demo room created. It reads the ignored private session file; it does not print its privileged tokens.

## Next integration gates, in order

1. **Real GLB assets.** The 3D kite, spool, box and card described in the teammate brief do not exist yet as this package's final authored assets. The 2D SVG overlay is an illustration of their intended behavior. Deliver the kite/spool first.
   Before final placement, validate the generated backdrop from both intended viewing regions. Do not build the second telling around an uninspected reverse view.
2. **Native interaction.** Add one selected-client adapter explicitly. The IWSDK fallback currently opts in photographs only; Gate uses a different XR framework. Verify grab → lift → string follows → safe release/dock → pause in the chosen runtime, then on Quest 3. Preserve that client's voice and pointing input ownership. Both clients now share the adequate World Labs far-plane policy; visually check the complete meadow in Gate when integrating it.
3. **Server story semantics.** Add supported kite/spool nouns and per-contributor color/ribbon/placement proposals with source ownership, revisions, rejection/undo and explicit human illustration choice. Preserve both tellings, including disagreements; selected perspective is local viewing state. The local rehearsal does not prove this server integration.
4. **Physical Quest evaluation.** Check the 100k option as well as full quality, scene scale, side/back views, near floor, seated reach, headset pause, discomfort and dropped frames. No physical headset was available for this evaluation.
5. **Human story and language.** Choose one actual language pair, obtain the participant's permissions, test recognition with a bilingual teammate and attach original audio only when consented. No real family speech or human language review was tested here.
6. **Polish the whole two-minute loop.** Keep source captions concise, preload the world, adjust prop lighting to the actual meadow, and rehearse a quiet ending with an original-voice keepsake or explicitly labeled transcript fallback.

No further paid generation is authorized by this evaluation. The local World Labs counter is five of five after the approved meadow. The generation's 1,580-credit / US$1.264 cost is an estimate based on documented ordinary-image pricing; settled billing was not audited.
