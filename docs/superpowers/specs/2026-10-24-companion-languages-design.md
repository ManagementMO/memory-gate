# The companion speaks your language: design

Date: 2026-10-24 · Branch: `cartesia` (from `origin/main` at `8b1948c`) · Status: approved by the team for build
(language selection, automatic replies, Ariana voice)

## Why

Memory Gate's companion (the marble figure in the Gate app) already hears Spanish and French. Cartesia's `ink-2`
recognises English, Spanish, French, Hindi and Japanese and detects which one it heard. But everything after
recognition assumes English:

- Most of what the companion says is fixed English text: the greeting, nudges, "Here we are", the goodbyes (29
  `say()` calls in `apps/gate/src/flow/controller.ts`).
- The replies Claude writes (`convex/guide.ts`, prompt in `packages/shared/src/guide.ts`) are told to "speak in
  their language". But nothing tells the app which language a reply is in, so Sonic receives no `language` and reads
  Spanish in an English way.
- The offline rules, the "I'd like to leave" detector and the safety filter only understand English.
- The prepared places ("this hill" brings the meadow) and bringing things in from the library match English words
  only.

We want someone to talk to the companion in English, Spanish or French and have it answer in the same language,
naturally and safely. A small setting lets a family pin one language.

## What a person experiences

- **Automatic (the default).** The companion greets in the device's language (English, Spanish or French; otherwise
  English). From then on it answers in whatever language the person last spoke, scripted lines included. Someone
  who switches from English to Spanish mid-visit gets Spanish from the next line on.
- **A pinned language.** On the start page, a new round gear button beside "Your moments" opens a small glass panel
  titled *Your companion*. Its one section is **Language**, with the choices *Automatic · English · Español ·
  Français* and one sentence of explanation. With a language pinned, the companion always speaks it, even if the
  person answers in another.
- The choice is remembered on that device. It takes effect from the next Begin.
- The companion's voice, captions, offline replies, place introductions and photo comments all follow the
  conversation language. Spanish or French words also bring in the prepared places and the library things they name,
  as English words do today.
- Leaving works instantly in every supported language ("quiero irme", "je voudrais partir"), even offline, just as
  "I'd like to leave" does today.
- Other languages: ink-2 also detects Hindi and Japanese. Someone speaking one of those keeps today's behaviour:
  Claude answers in their language, now also spoken by Sonic with the right language code. The fixed lines stay in
  the last supported language, and the panel promises only English, Spanish and French. These two languages are not
  localised or tested *(my call)*.

The approved mockup (start page with the gear and the panel open) is in
`.superpowers/brainstorm/55151-1792900080/content/companion-settings-v2.html` in the main checkout. Its *Voice*
section and its "where should the gear live" choice are superseded by this document: there is no voice picker, and
the gear lives on the start page only. Its note under Automatic is superseded too: it should promise only English,
Spanish and French.

## Goals

1. The companion answers in English, Spanish or French, matching the person (Automatic) or the pinned setting.
2. Every line it speaks or captions is in one language, the conversation language. No English scripted line
   interrupts a Spanish conversation.
3. Sonic is told the language of every line, so Spanish and French sound right.
4. The safety rules (no medical talk, no quizzing, no links, short lines) and instant leaving hold in all three
   languages, online and offline.
5. Spanish and French words drive the scene (prepared places, things from the library, placement) as English
   words do.
6. English behaves exactly as today, apart from the companion's voice (now Ariana, see 6 below).

## Non-goals

- **A voice or personality picker.** Dropped: Cartesia has no personality presets. Its library is 500+ voices, each
  with a name, tagline and description; personality in the behavioural sense is only configurable in Cartesia's
  Managed Agents product, by writing your own prompt.
- Languages beyond English, Spanish and French in the panel. The code keeps languages in one table so others can be
  added later, but only these three are built and tested. Outside ink-2's five detectable languages, adding one would
  also mean switching speech recognition to `ink-whisper` with an explicit language.
- Translating the interface chrome: the start page headline, buttons, album and the settings panel's own labels stay
  English. Only the companion's spoken and captioned lines change language.
- The phone and the IWSDK headset app. Their correction pipeline (`packages/shared/src/contract.ts`) already detects
  language and replies in it. Changes to the shared voice module must stay backward compatible for them.
- Live interpretation between two people speaking different languages, including the bilingual kite scene. That is
  handed to the multiplayer work (see the end).
- Fixed lines, offline replies and leave patterns for Hindi, Japanese or any language beyond the three.

## Anti-goals (failures even if it technically works)

- A Spanish or French speaker hears any English companion line during a Spanish or French conversation (except an
  untranslated proper name or a place title someone gave in English).
- The language flips back and forth on short or ambiguous replies ("ok", "mm", a name).
- A non-English reply slips past the safety filter that an English reply would have failed.
- Leaving, resting or the companion's patience gets worse in any language.
- Any extra paid call per turn, or extra waiting for English speakers.
- One spoken line mixing two languages. Sonic takes one language per request.

## Decided by the team

- No personalities. Build the language switch and automatic replies in the person's language.
- A default plus a settings button to change it. Automatic is the default. The gear and panel follow the mockup the
  team approved.
- English, Spanish and French are the languages to support and test.
- The companion's voice in the Gate is Ariana in all three languages. It replaces Diana there, so the voice stays the
  same when the language changes.

## Constraints and facts

Cartesia (team research notes of 2026-10-23, the live docs checked 2026-10-24, and a live `GET /voices` call on
2026-10-24):

- **Recognition.** `ink-2` on `/stt/websocket` auto-detects en, es, fr, hi and ja and takes no `language` parameter.
  Its transcript messages *may* carry a `language` field. The docs show one in an example, but it isn't in the schema,
  so it can't be relied on. No recognition changes are needed for these three languages.
- **Speech.** `sonic-3.6` speaks 44 languages, chosen with `language` (or `locale`, e.g. `es-MX`, never both; both
  returns 400). The docs don't say what happens when it's omitted. `generation_config.emotion` is English-only (beta);
  `speed` 0.6–1.5 works for all languages. One language per request.
- **Accents.** A voice sounds native only in the accents its `accents[]` lists. The current voice, Diana
  (`ea93f57f-…`, tagline "Gentle Mom"), lists only `en-US`, so her Spanish and French carry an American accent.
  Ariana (`ec1e269e-9ca0-402f-8a18-58e0e022355a`, "Kind Friend") lists `en-US` (native) plus `es-ES`, `es-MX`, `fr-CA`
  and `fr-FR`, among others. Cartesia lists her among its Emotive voices, which it suggests for companion apps.
- **No translation.** Cartesia doesn't translate. Claude does.
- **Project rules** (README, ARCHITECTURE, existing code):
  - Provider keys never reach a browser; the voice module gets a short-lived token from `convex/voice.ts`.
  - Claude only proposes; code decides what a reply may do, and every reply passes `safeReply`.
  - Leaving is detected in code before any model call, so it always works.
  - Guest devices that join a visit stay quiet; the main device speaks.
  - `?mode=offline` rooms make no paid calls, and the offline rules must carry a whole visit.
  - The calm UI contract applies: nothing flashes, and every brightness change takes at least 0.4 s.
- **Teammates edit `packages/shared/src/places.ts` heavily** (the prepared places). Avoid restructuring it, so merges
  stay easy.

## How it works

Each part names the existing code it changes. Items marked *(my call)* were chosen during design, not by the team.

### 1. The language model of the conversation

- **A setting:** `auto | en | es | fr`, default `auto`, stored per device in `localStorage` and mirrored in the Gate
  store (`apps/gate/src/state/store.ts`).
- **A conversation language:** `en | es | fr`, the language of every fixed line and of Claude's replies. The language
  passed to Sonic is the actual language of the line being spoken. That is normally the conversation language. It can
  be Hindi or Japanese when Claude answers someone speaking those (see "Other languages" above).
  - Pinned setting: the conversation language is always that language.
  - Automatic: it starts as the device language (`navigator.language`, if en, es or fr; otherwise en). After each
    thing the person says, it becomes the language of those words, when that is known confidently.
- **How the language of the person's words is known, in order:**
  1. The `language` Claude returns with its reply (the normal path, at no extra cost).
  2. The `language` ink-2 reports, if present.
  3. A small offline detector in shared code, based on common en/es/fr words, for offline rooms and as a backstop
     *(my call)*.

  Short or ambiguous words never change the conversation language. Below a few recognisable words, it stays as it was
  *(my call; the builder picks the threshold, and tests pin the behaviour)*.
- **The register is respectful:** *usted* in Spanish and *vous* in French, for scripted lines and for Claude alike,
  matching the grown-up storyteller. In the grandchild perspective, where the prompt already asks for simple playful
  words, Claude may use *tú* and *tu* *(my call)*.

### 2. Claude's reply carries its language (and an English reading)

`convex/guide.ts` and `packages/shared/src/guide.ts`:

- `GuideInput` gains the setting and the current conversation language.
  - Automatic: "reply in the language of their latest words".
  - Pinned: "always reply in Spanish".
- `GuideReply` gains two fields:
  - `language`: the ISO 639-1 code of the person's words, which is also the reply's language in Automatic.
  - `english`: a faithful English translation of the person's words, or `""` when they spoke English.

  These ride in the same structured call, so a turn makes no additional request. This mirrors the phone pipeline's
  `translation` field.
- `GuideReply` also gains `reply_english`: a faithful English reading of Claude's own reply when it isn't English.
  `safeReply` checks both the reply and this reading, giving a safety backstop for every language, Hindi and Japanese
  included. The phone pipeline's `reply_translation` works the same way *(my call)*.
- `GUIDE_SYSTEM` states the language and register rules and keeps every existing rule.
- The client keeps `safeReply` as the final gate (see 4).

### 3. Every fixed line is localised

- All companion lines in `controller.ts` move into one table of `en`, `es` and `fr` versions, with named placeholders
  for host names, captions and place titles, and are spoken through it. The builder decides where the table lives
  (e.g. `apps/gate/src/flow/lines.ts`).
- `guideOffline` returns its replies in the conversation language (en, es or fr).
- **Place introductions:**
  - The Claude planner's `intro` (`PLAN_SYSTEM` in `packages/shared/src/scene.ts`, and `convex/sketch.ts` `plan` and
    `detail`) is requested in the conversation language.
  - The offline planner's intro template gets es and fr versions.
  - The prepared places' intros (courtyard, Red Kite meadow) get es and fr versions, kept outside `places.ts` (e.g.
    in the lines table, keyed by place) so teammates' edits there aren't disturbed *(my call)*.
- **Photo and video comments.** `convex/sketch.ts` `caption` and `see` return the caption and title in the
  conversation language. Today they are always English, and "I can see {caption}" would mix languages.
- **Album fallbacks** such as the "Our visit." caption in `moments.ts` follow the conversation language too.

### 4. Safety and leaving in three languages

- **`safeReply`** gains Spanish and French equivalents of its medical and quiz patterns: cure/treatment/diagnosis/
  dementia/Alzheimer's/medication/symptoms/memory loss, and "do you remember…", "try harder", "you're wrong". Each
  language is held to the same standard as English. The 34-word cap stays. For Claude's replies, `safeReply` also runs
  on the English reading (`reply_english`, section 2). A reply fails if either version fails, and falls back to the
  offline reply in the conversation language.
- **`asksToLeave`** recognises clear wishes to stop or leave in Spanish and French. Like the English version, it must
  not fire on memories that merely mention leaving ("dejábamos la puerta abierta", "on partait le dimanche").
- **The rest detector** in `guideOffline` gains es and fr phrases.
- **`asksToEnter`** (does the companion's line invite stepping through?) recognises the Spanish and French
  invitations Claude and the offline rules produce, so the next "sí" or "oui" means go.

### 5. Spanish and French words still build the place

- In the gathering phase, `placeWords()` (prepared-place recognition and library bring-in) currently runs on the
  English keywords before Claude answers. When the conversation language isn't English, it runs on the reply's
  `english` after Claude answers.
- In the memory phase, `memory.bringIn()` is handled the same way.
- English is unchanged, with no added wait.
- The person's original words remain what is kept and shown: quotes, moments, captions, attribution and the planner's
  input. Claude plans from the original words directly.
- **Offline**, with no translation available, non-English words don't trigger English keyword matches. That's an
  accepted degradation: the companion still answers in their language.

### 6. Speech: language, emotion and voice

- **The Gate engine** (`apps/gate/src/voice/engine.ts`): `say(text)` becomes `say(text, language)` and passes it
  through to the shared module's existing `speak(text, { language })`.
- **The shared voice module** (`apps/headset/src/voice/tts.ts`): it sends `emotion: 'calm'` only when the line's
  language is English (or unknown). `speed` stays 0.95. This also stops the headset sending an English-only control
  with its Spanish lines.
- **The voice is Ariana in all three languages** (decided by the team). Ariana is `ec1e269e-9ca0-402f-8a18-58e0e022355a`,
  "Kind Friend", native in en-US, es-ES, es-MX, fr-CA and fr-FR, so the companion keeps one voice when the language
  changes. It applies to the Gate only:
  - The Gate passes a voice id override to the shared module (an optional field on `createVoice` options or on
    `speak()`). The module uses it for the TTS request instead of the minted `voiceId`.
  - The token from `convex/voice.ts` isn't tied to a voice, so `VOICE_ID` there stays Diana. The headset and phone
    don't change.
- **The browser fallback** (no Cartesia token):
  - Recognition uses the pinned language's BCP-47 tag (`en-US`, `es-ES` or `es-MX`, `fr-FR`; the builder chooses),
    or `navigator.language` in Automatic.
  - Synthesis chooses a system voice whose `lang` matches the line.
  - The social composer's dictation (`SocialUI.tsx`) follows the same rule.

### 7. The settings panel

- **The gear:** a round glass button matching the existing `moments-btn`/`icon-btn` style, beside "Your moments" on
  the start page only *(my call)*. Mid-visit, Automatic already follows whoever is speaking.
- **The panel:**
  - Desktop: a right-side glass sheet.
  - Phone: a bottom sheet.
  - Its title is *Your companion*. It holds the four language choices, written in their own language; a one-line
    explanation that changes with the choice; and ✕/Done. For Automatic the explanation reads, for example, "Listens
  for English, Spanish and French, and answers in whichever it hears."
- **Accessibility:** Escape and ✕ close it. Focus moves into the panel and returns to the gear. It's usable by
  keyboard and screen reader, and reduced motion is respected.
- **Guests:** shown for guests too, because their captions follow their own device's setting.

## Testing

- **Unit tests** (vitest, `tests/smoke/`, fixture-only):
  - the language detector on en/es/fr sentences and on short or ambiguous words;
  - `asksToLeave` positives in three languages, plus negatives for memories that mention leaving;
  - the rest phrases;
  - `asksToEnter` in three languages;
  - `safeReply` blocking medical and quiz lines in es and fr while passing ordinary warm lines;
  - `guideOffline` answering in the conversation language;
  - the lines table being complete: every key in en, es and fr, with the same placeholders;
  - the guide prompt containing the language instruction for each setting.
- **A browser check** (fixture-only: `?mode=offline&voice=off`), modelled on `apps/gate/scripts/flow.mjs` with
  `window.__gate.flow.testHear()`:
  - pin Español, Begin, and the greeting caption is Spanish;
  - a Spanish description gets a Spanish reply;
  - "Quiero irme" leaves to the album;
  - Automatic: a French turn makes the next companion line French;
  - the existing English flow passes unchanged.
- **A live check** (paid, small, only when the team asks): synthesised Spanish and French sentences through real
  ink-2, Claude and Sonic, using the existing `voice-e2e` scripts, to confirm detection, reply language and spoken
  language end to end.
- The existing suites (`npm run typecheck`, `npm test`, the Gate scripts) stay green.

## Left to the builder

- The exact Spanish and French wording. It must be natural, warm and in the register above, never word-for-word;
  have a fluent reader check it.
- Regex and detector details, and the confidence threshold, pinned by tests.
- File and module names, store field names, and where the lines table and detector live.
- Whether `asksToEnter` stays pattern-based or the guide returns an explicit flag, provided it works in all three
  languages.
- Spanish and French accents for TTS (`language` alone vs a `locale` such as `es-MX`/`fr-FR`), after a short
  listening check.

## Handed off: a bilingual visit in the kite scene

In the Red Kite meadow, the grandmother speaks Spanish and the grandchild speaks English and not much Spanish. Each is
on their own device. The companion and the dialogue captions should carry each one's words across to the other. The
person working on multiplayer will build this. It is not part of this branch.

This branch leaves them these building blocks:

- A per-device language setting.
- A conversation language that follows the speaker.
- A `language` and an English reading (`english`) on every guide reply.
- A Gate voice that speaks any of the three languages.

Ideas from the design conversation, for that work, none of them decided:

- Give a joining device its own voice when its language differs from the main device's. Today a joining device
  stays quiet.
- Carry translations alongside the perspective turns the exchange already shares. Under the exchange's additive rule,
  that means a new table, not new columns.
- Have the listener's companion say, in the listener's language, what the other person said.
- If the devices share a room, filter out the other person's language on each device so one utterance isn't handled
  twice.
