# Perspectives: seeing a memory through two pairs of eyes

Branch `social-experience`, built on the team's SpacetimeDB presence for the gate (`main` 5ba599f).

Every visit in `apps/gate` can now be seen through two perspectives:

| Perspective | Who they are in the memory | Eye height | Who |
|---|---|---|---|
| **Grandparent** | A grandmother of about 75 (1.56 m) | 1.45 m | The host by default |
| **Grandchild** | A boy of about 8 (1.31 m) | 1.21 m | Guests by default; meant for a real grandchild |

Each eye height is that person's own (branch `human-models`), so what you see from matches the body the other person sees. The two are rigged MakeHuman characters (CC0) in `apps/gate/public/people/`; see [AVATARS.md](AVATARS.md).

Anyone can claim one, with the name the others see. Unclaimed perspectives are still usable.

- **Two people in the room.** Each perspective stands somewhere in each memory. By default they stand on opposite sides of the room, facing each other. When a story says where someone was ("a little red stool by the stove"), that perspective moves beside it: Claude reads the words (`guide.locate`), with a plain word match standing in without it. Through the grandparent's eyes you stand at the grandparent's spot and see the grandchild across the room, and the other way round. When nobody is seeing through the other perspective, a stand-in waits at its spot. Someone seeing through your own eyes shares your spot and isn't drawn inside you.
- **Headset.** The one Quest wearer can step into either perspective: **X** cycles, **Y** opens a wrist menu, and with hands a light on the left wrist opens it. Through the grandchild's eyes the world grows around the wearer's feet until their eyes are at the boy's 1.21 m. The XR origin is scaled behind a soft blink; head tracking stays one-to-one and the floor stays under them.
- **Phones and laptops** use the same website. They start at their perspective's spot and see first-person at its eye height, facing the other perspective (drag to look), or switch to the overview.
- **Walking about.** A laptop walks with **W A S D** or the arrow keys (Shift to hurry, **R** back to your spot), a phone with the walk pad, and the headset with the **left stick** (the right stick turns in 30° steps) as well as by really stepping about. The controls are the Red Kite page's (`red-kite/navigation.ts`, `TouchPad`). In the meadow, movement is resolved on its real ground by its collision mesh (`red-kite/traversal.ts`: slopes, steps, trees, the world's edge). Elsewhere the floor is flat and you stay in the room. People keep a little room between them: a step that would bring you within 0.6 m of someone slides past them instead. Changing perspective (or the story moving your perspective) starts you again at that spot.
- **Switching in the headset** happens behind the blink. The XR origin is scaled to the perspective's eye height and moved and turned, so the wearer's head lands on the perspective's spot facing the other one. Head tracking stays one-to-one.
- **Everyone in the memory appears where they really are**, as their perspective's person (the boy or the grandmother), or as their own likeness if they shared one (see [AVATARS.md](AVATARS.md)). They stand on the ground and **walk when the person walks**: the walk plays as fast as they really move, facing the way they're going (stepping back plays it backwards), and stops when they stop. Their head turns as they look; in the headset their arms reach for their hands, otherwise they swing with the walk or rest at the sides. People still at the gate stay the soft lights beside you.
- **Two voices, one companion.** Both people talk with their own mics and the companion holds one conversation with both, heard on both devices (branch `multiplayer-voice`, see [MULTIPLAYER_VOICE.md](MULTIPLAYER_VOICE.md)).
- **Prepared places are shared.** When the host's words call up a prepared place (the meadow, the courtyard), the host's device keeps it as the visit's memory (`memories.share`), with each thing brought in, so a guest (a headset waiting at the gate, say) follows into it as into any sketched memory.

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
node apps/gate/scripts/xr-check.mjs            # emulated Quest: grandchild's eyes put the wearer's eyes at 1.21 m
node apps/gate/scripts/walk-check.mjs          # laptop (boy) + emulated Quest (grandmother) walking in the meadow, live
node apps/gate/scripts/prepare-people.mjs      # rebuild public/people/ from the source characters (glTF-Transform)
```

## Verification status (2026-10-24, on `main` 08d1161 + this branch)

**Verified:**
- `npm run test:exchange`: 7/7 against real SpacetimeDB 2.13 and the gateway. That is the team's 5 plus 2 for perspectives: room-scoped poses, claims, attributed stories and things, a handoff with copies, and erasure with the room.
- Publishing this module over `main`'s (no `-c`) kept existing presence and board rows.
- Convex smoke tests: 86/86.
- Gate typecheck and build.
- `multiplayer-check.mjs` passed every step, with presence on SpacetimeDB for both devices and 0 page errors:
  - nearby join;
  - each device picks whose eyes;
  - the phone stands in the memory at 1.10 m;
  - "look here";
  - the phone's note is kept as the grandchild's (told by Lily), with its thing;
  - handed to the grandparent and kept;
  - the host's spoken words are kept as the grandparent's story.
- `xr-check.mjs` (emulated Quest):
  - Eyes 1.60 m; the grandchild's eyes give world scale 0.69 and eyes at 1.10 m.
  - The wearer stands exactly at the grandchild's spot, facing the grandparent, with the grandparent's stand-in across the room.
  - Switching back puts them at the grandparent's spot with the grandchild across.
  - 0 errors.
- `multiplayer-check.mjs`, perspective spots: Lily's "by the stove" moves the grandchild's spot there. Through the grandparent's eyes the host sees her across the room; through the grandchild's eyes the host shares her spot and sees the grandparent across the room.

**Not yet verified:**
- A real MPFB/FaceBuilder likeness.
- The wrist menu and the comfort of the scale blink on a physical Quest.
- An archive search and pin end to end. This needs `ATLAS_MODE=local` and a room that isn't offline; the photo frame rendering is untested.
