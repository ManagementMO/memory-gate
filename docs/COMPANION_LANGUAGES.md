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

## Status (as of 2026-10-25, before pausing)

| Check | Result |
|---|---|
| `tests/smoke/companion-language.test.ts` | **32/32** after the review fixes |
| `npm run typecheck`, `npm --prefix apps/gate run typecheck` | clean after the review fixes |
| `npm test` (full smoke suite) | **135/135** at `586e2d3`, run with `--maxWorkers=4`. The review fixes after it touch only `packages/shared/src/guide.ts` and `apps/gate/src/flow/controller.ts`, and no other smoke file imports them. |
| `npm --prefix apps/gate run build` | OK at `586e2d3` |
| `node apps/gate/scripts/language-check.mjs` (browser, free) | **15/15** at `586e2d3`, before the review fixes. **Not rerun after them.** |
| Whole-branch code review | Done. 2 Critical and 6 Important findings fixed in `010ae4e`; 7 minor items deferred (listed below). |

## Gaps: please do these before merging

1. **Rerun the browser check after the review fixes.** It now has a 16th check that has never run: "Automatic: a
   goodbye in Spanish is answered in Spanish", which covers the fix in `heard()` that says the instant goodbye in the
   language of the wish. Both of its runs here timed out on `page.reload` because the machine was overloaded (load
   average 100–200 from other sessions), not because of a code failure.
2. **Rerun the long English walk-through,** `node apps/gate/scripts/flow.mjs <outDir>`, on a quiet machine. Here it
   timed out waiting for the brief "forming" stage, and it also failed against `main`'s own Gate as a control.
   `language-check.mjs` now includes an English visit that checks today's lines word for word, and it passed.
3. **Live test with real voice.** Cartesia and Claude were never called from this branch. The first real Spanish and
   French turns will be your test. Things to listen for:
   - Ariana's accent. Sonic currently gets `language` only. If you want Mexican Spanish or metropolitan French, send
     `locale` (`es-MX` / `fr-FR`) in `apps/headset/src/voice/tts.ts`.
   - Whether Claude really returns `language`, `english` and `reply_english`.
   - That a short "ok" never makes the companion answer in English mid-Spanish.
4. **A fluent reader for the copy.** The Spanish and French in `apps/gate/src/flow/lines.ts` and in the `OFFLINE`
   table of `packages/shared/src/guide.ts` use *usted* / *vous*. Nobody fluent has read them yet.
5. **Merge `main` first.** `origin/main` was 21 commits ahead when this paused (the Apify add-ons, "the boy and his
   grandmother"). Files changed on both sides: `apps/gate/src/flow/controller.ts`, `apps/gate/src/flow/memory.ts`,
   `apps/gate/src/social/ui/SocialUI.tsx`, `apps/gate/src/ui/Overlay.tsx` and `apps/gate/src/ui/TopBar.tsx`. Expect
   two conflicts:
   - **`TopBar.tsx`:** keep both: `SettingsButton` on the portal, and main's `places-objects` button in the memory,
     with both imports.
   - **`memory.ts`:** keep main's `sharing` field and `sharePlace()`, keep this branch's `language` field and
     `setLanguage()`, and use main's `adopt(…, place)` signature.

   Main's new features add no companion speech, so nothing new needs translating.
6. **Redeploy Convex after merging.** `api.sketch.caption/plan/see/detail` gained an optional `language` argument. An
   older deployed backend rejects the extra argument, and the Gate then quietly falls back to offline planning and no
   photo caption until the new functions deploy. `convex dev`, as started by `npm run local:up`, deploys them on
   change. `api.guide.respond` takes `v.any()`, so it works either way.

## Known minor issues (deferred, found in review)

- The Spanish safety filter blocks a few warm lines and falls back to an offline reply: "Eso me recuerda que…",
  "el cura del pueblo", "jamón curado", and the French "guéridon".
- Short English captions ("yellow curtains over a sink") aren't recognised as English, so "Veo yellow curtains…" is
  possible. That only happens in the turn where the person switched language, or for a photo a guest sent.
- For a prepared place, the album's final caption is the place's English intro even in a Spanish or French visit
  (`moments.captureFinal`).
- A bare "si" counts as "yes" when the companion has just invited them to step through ("Si no me equivoco…").
- "Retrato" in the Spanish photo keywords makes describing a portrait offer the photo picker.
- The settings panel has no focus trap, the same as the invite sheet. On landscape phones wider than 640 px, Done can
  be clipped. `close()` finds the gear by its test id.
- The captions' `lang` is the conversation language, even for a single line Claude spoke in Hindi or Japanese.
- **Not from this branch:** English already ends the visit on "I want to go back to my grandmother's house" and
  "That's all I remember". This was left unchanged because English stays word for word, but it deserves its own fix.

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
