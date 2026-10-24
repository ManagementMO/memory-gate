# Perspectives: seeing a memory through two pairs of eyes

Branch `social-experience`, built on the team's SpacetimeDB presence for the gate (`main` 5ba599f).

Every visit in `apps/gate` can now be seen through two perspectives:

| Perspective | Eye height | Who |
|---|---|---|
| **Grandparent** | 1.6 m | The host by default |
| **Grandchild** | 1.1 m | Guests by default; meant for a real grandchild |

Anyone can claim one, with the name the others see. Unclaimed perspectives are still usable.

- **Headset.** The one Quest wearer can step into either perspective: **X** cycles, **Y** opens a wrist menu, and with hands a light on the left wrist opens it. Through the grandchild's eyes the world grows around the wearer's feet until their eyes are at 1.1 m. The XR origin is scaled behind a soft blink; head tracking stays one-to-one and the floor stays under them.
- **Phones and laptops** use the same website. They stand at their own spot at the front of the memory and see first-person at their perspective's eye height (drag to look), or switch to the overview.
- **Everyone in the memory appears where they really are**, at their perspective's height: as a porcelain figure in their colour, or as their own likeness (see [AVATARS.md](AVATARS.md)). Their head turns as they look; in the headset their arms reach for their hands. People still at the gate stay the soft lights beside you.

## What each perspective keeps (SpacetimeDB)

| Kept per perspective | Where it comes from |
|---|---|
| **Stories and notes** | Speech inside the memory (an added detail, or a longer remark), or a typed or spoken note on a phone. Stored with the speaker's name and the perspective they were seeing through. |
| **Things in the place** | What a perspective's words add. Generated with `sketch.detail` using `persist:false`, so the shared memory never changes, and placed at a fixed spot so every device draws it in the same place. The perspective's own things are solid; the other perspective's are faint **ghosts**. |
| **The companion's thread** | The last 40 turns, plus a short summary refreshed every 10 turns. The companion is told whose eyes it is speaking to, what this perspective remembered, its archive photographs, and what the other perspective remembers here. It treats archive photos as general history, never as this family's. |
| **Archive photographs** | Library of Congress records from the team's Apify Actor. They are searched on a phone, hung on the back wall for that perspective, and also added to the family board. Images are served through the gateway, only for pinned public-domain records. |

**Interacting:**
- See each other.
- "Look here" marks (the teammate's).
- Hand a story across: it waits in the other perspective until someone seeing through those eyes keeps it, and keeping it copies the story and its things.
- Open a ghost or a small light to read the other side.

## How it is built

```
gate (Quest / phone / laptop) ── one /exchange socket ──► gateway (services/exchange/server.mjs + social.mjs)
   presence: here/point/leave (teammate)                     checks Convex membership on every action,
   perspectives: pose (own fast lane, ≤20/s), claim, story,   calls operator-only reducers, pushes `social`
   object, turn, summary, pass-story, respond-handoff,         snapshots and coalesced `poses` (≤15/s) to that
   avatar (archive search + pin use a second short socket)     room's devices only
                                                                └──► SpacetimeDB (spacetimedb/src/index.ts)
Convex: rooms, members (rooms.rename), consents, files, Claude (guide.respond/summarize, sketch.detail), avatars
```

- **All new tables are private** and every reducer is operator-only, the same model as the exchange. The browser never sees a SpacetimeDB credential. Room and member always come from the gateway's Convex check.
- **Changes are additive:** new tables and reducers only, no changed columns. Publish without `-c`.
- **Without the exchange,** the teammate's Convex presence fallback keeps lights and marks working. Perspectives still change height and view on each device ("Kept on this device only"), but nothing is saved.

**Main files:**
- `spacetimedb/src/index.ts` (perspective section)
- `services/exchange/social.mjs`
- `apps/gate/src/social/*`
- `convex/avatars.ts`
- `convex/guide.ts` (`summarize`, perspective lines)
- `convex/sketch.ts` (`persist`)
- `convex/rooms.ts` (`rename`)

The hook-ins to the teammate's files are a few lines each: `World.tsx`, `CameraRig.tsx`, `MemoryScene.tsx`, `Overlay.tsx`, `PresenceLights.tsx`, `presence/spacetime.ts`, `flow/controller.ts` and `flow/memory.ts`.

## Run and check

```sh
npm run local:up                         # needs the SpacetimeDB 2.13 CLI (see README)
npm run stdb:generate                    # after module changes: gateway bindings
npm --prefix apps/gate run dev           # https://localhost:5180 (Quest: the LAN address)
npm run test:exchange                    # includes tests/exchange/social.test.mjs
npx vitest run --config tests/smoke/vitest.config.mjs   # includes tests/smoke/social.test.ts
node apps/gate/scripts/multiplayer-check.mjs   # two devices; perspective checks run when presence is on SpacetimeDB
node apps/gate/scripts/xr-check.mjs            # emulated Quest: grandchild's eyes put the wearer's eyes at 1.1 m
```

## Verification status

**Verified so far:**
- Module and gate typechecks; gate production build.
- Convex smoke tests, including likeness consent and rename.
- Emulated Quest: eyes measured at 1.60 m; grandchild's eyes give world scale 0.69, which puts the eyes at 1.10 m; switching back restores scale 1.00.
- Flat-screen first-person at 1.1 m and 1.6 m, the picker and the dock, with no page errors.

**Not yet verified:**
- Publishing the module to SpacetimeDB and the gateway tests (`tests/exchange/social.test.mjs`).
- The two-device perspective check.
- A real MPFB/FaceBuilder likeness.
- Comfort of the scale blink on a physical Quest.
