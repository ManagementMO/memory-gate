# Places, photos and optional VR objects

The family can turn a public place reference or approved family photo into an optional conversation cue. A search never inserts an object. The complete flow is **find → review source → choose model → private preview → approve placement → select inside VR**. The object retains its source, family note, memory and perspective. A rendered bridge is an illustration, not a recovered scan or proof of a forgotten event.

This works in the general Gate journey and the separate Red Kite example. It uses the existing Gate stack (React Three Fiber, Three, `@react-three/xr` and Spark), Convex for reviewed sources/models and the main journey's existing SpacetimeDB perspective state. The older IWSDK application and headset configuration are preserved. No additional XR store, camera origin or controller bindings are introduced.

## Open it

Use Node 24, the existing root dependencies and local services. For a fresh checkout, first follow the root README, then install Gate and the Actor:

```sh
npm --prefix apps/gate ci
npm --prefix actors/historical-memory-atlas ci
npm run local:up
npm run demo:kite
npm --prefix apps/gate run dev
```

Leave existing services running when working in an already prepared checkout. Gate serves HTTPS on port 5180. The main portal's **Try a place-to-object example** opens the optional workshop; **Try The Red Kite** remains a separate choice. In an ordinary main memory, use the **Places and objects** icon in the top bar.

- Main experience: `https://localhost:5180/`
- Optional kite workshop: `https://localhost:5180/?story=red-kite&objects=1`
- Explicit live import copy: `https://localhost:5180/?story=red-kite&sources=live&objects=1`

The normal sample room is immutable offline mode. The live copy reuses the cached meadow in a separate room, preserving the sample and avoiding another world generation. For Quest, use the same laptop's HTTPS LAN address and existing certificate setup; `localhost` on the headset refers to the headset. Cached photo/model URLs use the existing same-origin file proxy so they also work over that LAN link.

## A complete demonstration without provider keys

1. Open the optional kite workshop. Choose **Try fictional park example**, then approve the clearly labeled fictional Willowbrook Park reference. It has no fabricated coordinates, Maps link or Apify run.
2. Choose an original footbridge, bench, flower planter or existing kite, and write a note such as “The little bridge reminds me of walking to the park together.” Choose the intended perspective.
3. Create the private model preview. It is visible only to family; an invited viewer sees nothing yet. The preview is warm-tinted and labeled, with normal depth so the meadow cannot paint over it.
4. Review it in the scene and choose **Place this object**. The joined viewer now sees it in that memory and POV. Changing your POV hides objects belonging only to the other perspective and leaves the other participant's view alone. Shared objects appear in both.
5. Enter VR and point at the object with the controller ray. Its source and note open as a real 3D card. Close the source to return to the story. Rest remains available. The kite route retains A/B/X/Y controls; the main app retains its existing wrist menu and bindings.
6. Use **Hide object**, or remove its source. The model disappears from joined devices. Model size and rotation can be adjusted in the workshop. Three small fixed placement slots keep props away from arbitrary teleportation or unbounded scene editing.

For an actual family photo without Apify, open **Photo sources**, confirm permission and upload a JPEG, PNG or WebP. The browser re-encodes it to JPEG and removes metadata before upload (input at most 5 MB; output at most 600 KB). Review and attach it, then choose **Make optional 3D object**. It can accompany any existing model. Only a separate consented generation choice sends the photo to Tripo.

## What Apify actually does

**Places:** a query such as “Golden Gate Park, San Francisco” starts the official [`compass/crawler-google-places`](https://apify.com/compass/crawler-google-places/api) Actor. We request at most three results, no images or reviews and no contact enrichment. The application retains title, address, an allowlisted Maps source link and coordinates when provided. The family approves the reference. Coordinates are provenance, not an instruction to move the headset or a claim that the illustration is geographically accurate.

**Social photos:** selected public Instagram photo-post links use the official [`apify/instagram-scraper`](https://apify.com/apify/instagram-scraper/api). Individual carousel images become private review cards with author, caption and source URL. The family chooses the image and note to attach. No private login, cookies, profile crawling or diagnosis is supplied. [Photo workflow details](APIFY_MEMORY_SOURCES.md).

**Custom Actor:** [Source Atlas 1.2](../actors/historical-memory-atlas/README.md) supports `archive`, `social` and `place`. Place/social modes orchestrate the official scraper, persist the child run ID and emit bounded normalized references. The app stores the parent run ID immediately and resumes that run after reload. Neither layer silently creates a new cloud run after an ambiguous failure.

This is meaningful retrieval and provenance for the object's source, not a claim that Apify renders 3D. Our original GLBs are generated by [the reproducible asset builder](../tools/memory-objects/build-assets.mjs). Image-to-3D is a separate Tripo task. Map photos remain linked on Maps; the pipeline does not extract Google's 3D tiles, copy its map imagery into a mesh or automatically send map photos to another vendor.

## Enable live retrieval and image-to-3D

There is **no Apify token available** in this checkout. The cloud adapters and custom Actor are implemented, but live Maps/Instagram runs and custom Actor cloud publication have not been verified.

Use the existing ignored private provider file (`auth/memory-gate.env`, the `MEMORY_GATE_ENV` override, or supported `MEMGATE_AUTH_FILE` override) or `.env.exchange`:

```dotenv
APIFY_TOKEN=your-private-token
ALLOW_APIFY_CLOUD=1
# Optional: after publishing Source Atlas with the Apify CLI:
# APIFY_MEMORY_ACTOR_ID=your-account~heirloom-historical-memory-atlas
# Existing image-to-3D credential; no duplicate variable is introduced:
TRIPO_API_KEY=your-private-token
```

Run `npm run env:push` against the existing local Convex backend. Keep secrets server-side. `APIFY_MEMORY_ACTOR_ID` selects the place/social custom Actor; existing `APIFY_ACTOR_ID` continues to select the archive gateway's Actor. Without the new custom ID, the app calls the respective official scraper directly. The private provider file takes precedence over process/exchange defaults. No frontend `VITE_` secret is needed.

Live model generation additionally requires the existing `objects.live` service flag and an explicit live room. This feature does not switch flags on. Do not enable unrelated paid voice or world-generation services just to try the workshop. Pick a reviewed family photo, select **Generate from this photo**, confirm the separate vendor consent and create the candidate. The action sends only the approved cached photo URL, not notes, diagnoses or recordings.

The adapter uses the official [Tripo v3 image-to-model API](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard), requests 6,000 faces, smart low poly and no textures/PBR, persists the task ID and polls that task. The downloaded static GLB is cached only after validating its host, bytes, embedded resources and geometry budget. A completed generation is still private; placement requires a separate approval. The existing per-room limit of three model submissions and one active generation applies. An ambiguous start is never automatically submitted again; inspect the provider dashboard first. **Live Tripo generation has not been run for this change.** Controlled provider responses verify the contract without consuming a paid task.

Place parent requests set a 210-second timeout and `maxTotalChargeUsd: 0.15`; custom child place requests set 150 seconds and `0.10`. Social requests retain their separate lower settings. These are request settings, not a guarantee about combined parent/child or account spending. One active import and the existing room cooldown apply.

## Shared state, provenance and cleanup

Convex enforces role and room membership on every write. Draft references and candidates remain private to family. Viewers receive approved places and placed models only. Objects are scoped to room, the specific memory key and perspective (`grandparent`/`child`/`shared` in the main app; `elena`/`rosa`/`shared` in the kite example). SpacetimeDB continues to own live collaboration, perspective definitions and participant claims; the viewing POV remains local to each participant. A POV change does not rewrite another participant's POV or replace their source.

Each room can hold 12 candidates and three placed models per memory/POV. Models use three fixed ground slots, 0.25–1.4 m size and rotation. Generated models must be static self-contained GLB 2, at most 12 MB and 20,000 triangles, with no external resources, animations or skins. The original bridge/bench/planter contain 1,348/204/2,316 triangles and three/two/six material batches respectively. Existing model load failures are contained to the individual prop; the story remains available.

Removing a place or photo removes dependent object candidates and releases unreferenced cached files. Room reset/deletion includes import, place and model records. A pause or membership change is rechecked before accepting a late download; unbound bytes are cleaned up. Removing an app source does not delete the original public post or the provider's task/dataset history.

The kite story's original recollections and illustration choices remain separate. A cue can invite “What comes to mind?”; it cannot establish an event as fact or demonstrate a clinical improvement in dementia.

## Verification

```sh
npm test
npm run test:atlas
npm run test:exchange
npm run typecheck
npm --prefix apps/gate run typecheck
npm --prefix apps/gate run build
npm run test:memory-sources
npm run test:place-objects
npm run test:red-kite
```

The browser scripts use actual Convex, original GLBs, live local SpacetimeDB for the main journey and the IWER Quest 3 emulator. Their rooms force paid provider calls off. The source-card checks enter an actual stereo immersive session and use real controller rays in the kite flow. Coverage includes private drafts, explicit approval, a second viewer, per-memory and per-POV scope, hide/cascade removal, direct photo upload, native source rendering and the existing story controls. Main companion captions step aside while a source is open so they cannot draw over it.

See [the compact report](../evidence/place-objects/verification.json) and [stereo main view](../evidence/place-objects/main-vr-source.jpg). Live Apify/Tripo, custom Actor publication and a physical Quest comfort, reach and sustained-frame-rate acceptance pass remain unverified. Passing the emulator does not establish physical headset performance.
