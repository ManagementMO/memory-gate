# Two voices, one companion

Branch `multiplayer-voice`, built on [SOCIAL_EXPERIENCE.md](SOCIAL_EXPERIENCE.md) and the boy and grandmother (branch `human-models`).

A grandparent (usually the Quest, a guest) and a grandchild (usually the laptop, the host) tell a story together in the same room, each with their own microphone and headphones.

The companion holds **one conversation with both of them**:
- It speaks to each by name and guides each in their own experience (the grandchild in simple, playful words).
- Every line it says plays on both devices.
- It remembers everything either person said.

It is the same companion as always: the same brain (`guide.respond`), voice and figure. It is not a second agent.

## How it behaves

| | |
|---|---|
| **Both listen** | A joined device used to stay quiet. Now it listens and speaks too, but only while the room's conversation (the exchange) is connected. Without the exchange, the host talks with the companion as before and the guest stays quiet. |
| **Whose words** | Each mic also hears the other person faintly. When the same words arrive from both devices, they're kept once, credited to the device that heard them loudest. Loudness is the speech level above that mic's own noise floor; automatic gain makes raw levels meaningless. A much quieter, garbled copy of the other person is dropped too. Two people both saying "yes" are both kept. Nothing acts on words until this is decided, a "take me back" included. Rules: `packages/shared/src/crosstalk.ts`. |
| **When it speaks** | They also talk to each other, so the companion waits for a lull: no one mid-sentence, 1.5 s of quiet from both, at least 4 s since its last line. Then it answers once, to everything just said. A question put to it directly skips the 4 s spacing. It may also decide to stay quiet while they're happily talking to each other (`listen`). Rules: `packages/shared/src/lull.ts`. |
| **At the gate** | Both people's words shape the place. The visit starts on the host's device, and the guest follows once the host is actually inside, not when a plan is saved mid-conversation. |
| **Inside** | A detail someone adds is theirs: their device adds it to their perspective, as a story and things in the place. Resting and leaving belong to the person who asked. |
| **Interrupting** | Speech while the companion talks doesn't cut it off at once, since it may be the other person, heard faintly. After about 0.4 s of this person's own voice, the line stops on every device. |
| **The grandchild's voice** | Whoever claims the grandchild's eyes has their words kept as text. Audio clips (album replays) are kept only after a parent or guardian agrees on that device; choosing "Grandchild" in the picker asks. Taking the agreement back deletes their clips (`convex/voiceGuard.ts`). |

The room's conversation is kept in SpacetimeDB:
- `conversationTurn`: who said what, by name and perspective, plus the companion's lines; the last 120 per room.
- `conversationSummary`: refreshed every ~12 turns.
- `utterance`: everything each mic heard, including the dropped copies. Never sent to devices.

All three are erased with the room.

## How it is built

```
device ─ `hearing` {turnId} at voice onset (fast lane) ───────► gateway: services/exchange/conversation.mjs
device ─ `utterance` {turnId, text, snrDb, durationMs, clip?} ─► whose words? (crosstalk.ts) → SpacetimeDB
host   ─ `flow` (stage, place, invitation) · `line` (its own scripted lines)
                                          lull → guide:respond as the last speaker (budget + membership as ever)
every device ◄─ `companion` {text, intent, heard[], detailFor, intentFor} · `hush`
```

| Area | Files |
|---|---|
| Gateway | `services/exchange/conversation.mjs` (new), hooks in `social.mjs` and `server.mjs` |
| SpacetimeDB | `spacetimedb/src/index.ts`: new tables and reducers only; publish without `-c` |
| Brain | `convex/guide.ts`, `convex/lib/guideRender.ts`: names, the people present, `listen`, `detailFor`. `packages/shared/src/guide.ts`: the Together paragraph and `guideTogether` (offline) |
| Device | `apps/gate/src/flow/companion.ts` (new), hooks in `flow/controller.ts`, turn ids and SNR in `voice/engine.ts`, `start({ interrupt: false })` in the shared voice module |
| Consent | `convex/voiceGuard.ts` (new), plus checks in `voice.ts`, `utterances.ts` and `moments.ts`; the picker's guardian step in `social/ui/SocialUI.tsx` |

Fixes found on the way:
- **Moment clips and consent:** moment clips now go with `voice_recording` when it's revoked, and the album serves audio only with that consent.
- **First snapshot race:** the gateway's join no longer races its own 5 s refresh, which sometimes left a new device without its first perspectives.
- **Guests sent back to the grandchild's eyes:** a guest's choice of eyes is no longer reset when the page re-suspends.

## Run and check

```sh
npm test                                               # includes tests/smoke/multiplayer-voice.test.ts
npm run test:exchange                                  # includes tests/exchange/conversation.test.mjs
node apps/gate/scripts/two-voices-check.mjs            # laptop (grandchild) + emulated Quest (grandparent), testHear-driven
node apps/gate/scripts/multiplayer-check.mjs           # unchanged flow, now through the shared conversation
```

Every check takes `GATE_URL` (`RED_KITE_ORIGIN` for the Red Kite ones). The exchange tests take `CONVEX_URL`, `EXCHANGE_WS` and `SPACETIME_DATABASE`, so a second local stack can run beside the main one.

## Not yet

- **Language:** each person's own language, which Cartesia ink-2 can't detect. A teammate's change is coming; replies follow the person's language only as far as the prompt asks.
- **Untested setups:**
  - a physical Quest;
  - two Cartesia speech sockets at once;
  - Quest Browser's own speech recognition, the fallback used without Cartesia keys.
- **No provider keys here:** the local Convex here has no Anthropic or Cartesia keys, so the companion answers with its offline rules and voice uses the browser's.
