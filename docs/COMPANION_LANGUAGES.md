# The companion speaks English, Spanish or French

Branch `cartesia`, built on `main` 8b1948c. This note is the handoff for whoever tests and merges the branch: what is
built, what has been verified, and what is still open.

Design: [docs/superpowers/specs/2026-10-24-companion-languages-design.md](superpowers/specs/2026-10-24-companion-languages-design.md).
Plan: [docs/superpowers/plans/2026-10-24-companion-languages.md](superpowers/plans/2026-10-24-companion-languages.md).

## What it does

- **Automatic (the default).** The Gate companion greets in the device's language (English, Spanish or French;
  otherwise English) and from then on answers in whatever the person last spoke. It switches only after at least
  three words, so "ok", "sí" or a name never flip it. Every line follows: Claude's replies, all 29 fixed lines,
  offline replies, place introductions and photo comments.
- **A pinned language.** A gear on the start page, beside "Your moments", opens the *Your companion* panel:
  *Automatic · English · Español · Français*. The choice is remembered on the device in `localStorage` key
  `mg.gate.language` and applies from the next Begin.
- **The voice.** The Gate companion uses Ariana (`ec1e269e-9ca0-402f-8a18-58e0e022355a`), a single voice that sounds
  native in English, Spanish and French. The headset and phone keep the room's voice (Diana): `convex/voice.ts` is
  unchanged.
  - Sonic receives each line's language.
  - `emotion: 'calm'` is sent only with English lines, because Sonic's emotion control is English-only.
- **Leaving and safety.**
  - Leaving works instantly in each language ("quiero irme", "me quiero ir", "je voudrais partir"), even offline.
  - The safety filter (no medical claims, no quizzing) covers Spanish and French. It also checks Claude's own English
    reading of every non-English reply, which covers Hindi and Japanese too.
- **Scene words.** Claude returns an English reading of what the person said, in the same call as the reply, so
  Spanish and French words still trigger the prepared places and library objects. There is no extra call per turn.
- **Speech recognition.** ink-2 already detects English, Spanish and French, so recognition is unchanged.
- **Out of scope.** The bilingual kite scene (the Spanish-speaking grandmother and the English-speaking grandchild on
  two devices) is not built here; the multiplayer teammate owns it. The design doc's last section lists the building
  blocks this branch leaves for that work.

## Status (2026-10-25, after the gaps were filled)

`main` (60af182: the memory map, Memora, the proposal showcase, the Apify add-ons, the boy and his grandmother) is
merged in. Everything below ran on the merged branch.

| Check | Result |
|---|---|
| `tests/smoke/companion-language.test.ts` | **36/36** (4 new: the review items fixed below) |
| `npm run typecheck`, `npm --prefix apps/gate run typecheck` | clean |
| `npm test` (full smoke suite) | **186/186** |
| `npm --prefix apps/gate run build` | OK |
| `node apps/gate/scripts/language-check.mjs` (browser, free) | **16/16**, including the 16th check that had never run ("a goodbye in Spanish is answered in Spanish") |
| `node apps/gate/scripts/flow.mjs <outDir>` (the long English walk-through) | passes end to end, 0 errors, English lines word for word |
| Local Convex | the merged functions are deployed (`convex dev` picked them up; `api.sketch.*` take `language`) |

## Gaps

Done:

1. ~~Rerun the browser check after the review fixes.~~ 16/16.
2. ~~Rerun the long English walk-through.~~ Passes on a quiet machine.
3. ~~A fluent reader for the copy.~~ A fluent pass over `flow/lines.ts` and the `OFFLINE` table (393f296): the
   Spanish is neutral Latin American for the families in California ("escuché", "envió", "video"), no gender guessing
   on photos vs videos, no plural "ellos" / "eux" for one person, and a few phrasings fixed ("¿Dónde queda este
   lugar?", "le vieux chêne au tournant"). A native speaker from the families' own region is still the best final read.
4. ~~Merge `main` first.~~ Merged (741a017). Four conflicts, each kept from both sides: `TopBar.tsx` (the gear beside
   the memory map button; "Places and objects" in a memory), `Icons.tsx`, `memory.ts` (`language` and `sharing`),
   `SocialUI.tsx`. Main's features add no companion speech.
5. ~~Redeploy Convex after merging.~~ Done locally. Any other deployment needs the same.

Still open:

- **Live test with real voice.** Blocked here: this checkout has no Cartesia or Anthropic keys (no
  `auth/memory-gate.env`; the local backend has only `ADMIN_CODE` and `WORKER_SECRET`). With keys in place
  (`npm run env:push`, `npm run services:live`), listen for Ariana's accent (send `locale` `es-MX` / `fr-FR` in
  `apps/headset/src/voice/tts.ts` if wanted), check that Claude returns `language`, `english` and `reply_english`, and
  that a short "ok" never turns a Spanish conversation English.

## Known minor issues

Fixed (9ea71fa):

- ~~The Spanish safety filter blocks a few warm lines.~~ "el cura del pueblo", "jamón curado", "guéridon" and "eso me
  recuerda que…" get through; "esto cura", "una cura para", "¿recuerda qué año…?" and "guérir" are still caught.
- ~~The album's final caption is the English intro for a prepared place.~~ It uses the intro in the visit's language.
- ~~A bare "si" counts as "yes".~~ Only "sí", a lone "si", or "si" with a yes ("si, vamos").
- ~~"Retrato" offers the photo picker.~~ Removed from the photo words.
- ~~The settings panel has no focus trap.~~ Tab stays inside it.
- ~~English ends the visit on "I want to go back to my grandmother's house" and "That's all I remember".~~ Going back
  somewhere and "that's all I remember" no longer end it; "can we go back now" and a bare "that's all" still do.

Still open:

- Short English captions ("yellow curtains over a sink") aren't recognised as English, so "Veo yellow curtains…" is
  possible. That only happens in the turn where the person switched language, or for a photo a guest sent.
- On landscape phones wider than 640 px, the settings panel's Done can be clipped.
- The captions' `lang` is the conversation language, even for a single line Claude spoke in Hindi or Japanese.

## How to check it

```sh
npm ci && npm --prefix apps/gate ci
npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts   # pure, seconds
npm run typecheck && npm --prefix apps/gate run typecheck && npm test

# Browser check (free: offline rooms, no voice engine). Needs a running Gate:
npm --prefix apps/gate run dev                                   # https://localhost:5180
node apps/gate/scripts/language-check.mjs --base https://localhost:5180
# From a second worktree, on its own port, against the shared local backend:
#   CONVEX_PROXY_TARGET=http://127.0.0.1:3212 GATE_PORT=5190 npm --prefix apps/gate run dev
```

By hand: open the Gate, press the gear, choose Español, press Begin and talk in Spanish. Or leave it on Automatic and
switch to French in the middle of a visit; the next line should be French.

## Where the code is

| File | What changed |
|---|---|
| `packages/shared/src/language.ts` | New. Languages, the common-word detector, and the rule for when the conversation language changes. |
| `packages/shared/src/guide.ts` | Spanish and French safety, leaving, entering and offline replies; `languageLines` (the prompt's language rule); `resolveReply` (each turn's language decision). |
| `convex/guide.ts` | Asks Claude for `language`, `english` and `reply_english` in the same call. |
| `convex/sketch.ts`, `packages/shared/src/scene.ts` | Captions, titles and intros in the conversation language; offline intros in es/fr. |
| `apps/headset/src/voice/tts.ts`, `apps/headset/src/voice/index.ts` | `generationConfig` (emotion only for English); optional `voiceId` override. Backward compatible. |
| `apps/gate/src/voice/engine.ts` | Ariana, each line's language, the browser fallback in the right language. |
| `apps/gate/src/flow/lines.ts` | New. Every fixed companion line in en/es/fr (English word for word as before), plus the prepared places' es/fr intros. |
| `apps/gate/src/flow/controller.ts`, `memory.ts`, `moments.ts` | The conversation language, localised lines, English readings for scene words, intro and caption guards. |
| `apps/gate/src/state/store.ts`, `apps/gate/src/ui/CompanionSettings.tsx` (new), `TopBar.tsx`, `Overlay.tsx`, `Icons.tsx`, `Captions.tsx`, `styles/app.css`, `social/ui/SocialUI.tsx` | The setting, the gear and panel, caption `lang`, dictation language. |
| `tests/smoke/companion-language.test.ts`, `apps/gate/scripts/language-check.mjs` | New tests: 32 unit tests and a 16-check browser script. |

## Calls made while building

These weren't decided by the team; all can be changed.

- The gear lives on the start page only. Mid-visit, Automatic already follows whoever is speaking.
- The register is *usted* and *vous*, with *tú* and *tu* allowed in the grandchild's perspective.
- Hindi and Japanese, which ink-2 also detects, keep today's behaviour: Claude answers in them and Sonic gets the
  language code, but the fixed lines stay in the last supported language.
- Spanish and French leave words only count at the end of what was said. "Volver a la casa de mi abuela" and
  "on peut y aller" ask to visit, not to leave.
- The settings panel has no backdrop blur and uses a night-tinted glass, so the companion stays in view and the
  white text stays readable over the bright sky.
