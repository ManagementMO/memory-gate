# The Companion Speaks Your Language — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Gate companion answers in English, Spanish or French. In Automatic it matches the person; a gear on the start page can pin one language. It speaks with Ariana's voice in all three.

**Architecture:**
- **Shared code:** a new `packages/shared/src/language.ts` holds the language rules (types, detector, switching rule).
- **Guide contract** (`guide.ts`): it learns three languages. That covers safety, leaving, entering, offline replies and the prompt's language instruction.
- **Claude's reply:** it carries the person's language and English readings, in the same call as today.
- **Gate:** it keeps a per-device setting and a conversation language. Every fixed line comes from a localised table. Each line is spoken with its language and with Ariana's voice id.

**Tech Stack:** TypeScript 5.9, React 19 + zustand (Gate), Convex 1.46 actions, zod 4, vitest 5 (`tests/smoke`), Playwright scripts (`apps/gate/scripts`), Cartesia Sonic 3.6 via the shared voice module.

**Spec:** `docs/superpowers/specs/2026-10-24-companion-languages-design.md`

## Global Constraints

- Languages: setting `auto | en | es | fr`, default `auto`, stored per device in `localStorage` key `mg.gate.language`.
  The conversation language is `en | es | fr`.
- Register: *usted* in Spanish, *vous* in French, for fixed lines and Claude alike. *tú* and *tu* are allowed only in the
  grandchild perspective (the prompt's existing playful-words rule).
- Voice: the Gate uses Ariana, `ec1e269e-9ca0-402f-8a18-58e0e022355a`, for every language. `VOICE_ID` in
  `convex/voice.ts` stays Diana. The headset and phone are unchanged.
- Shared voice module changes (`apps/headset/src/voice/*`) must stay backward compatible: only new optional fields.
- Sonic gets `emotion: 'calm'` only for English (or unknown-language) lines. `speed` stays 0.95. One language per
  spoken line.
- Every companion reply passes `safeReply`. Leaving is detected in code before any model call and works offline.
- No extra paid call per turn. English speakers see no added wait, and English lines and offline replies stay
  word-for-word as today.
- `?mode=offline` rooms make no paid calls. A whole visit in Spanish or French must work there.
- Guest devices that join a visit stay quiet (unchanged).
- Do not restructure `packages/shared/src/places.ts`. Translations live outside it.
- Calm UI contract: nothing flashes, and every brightness or opacity change takes at least 0.4 s; respect
  `prefers-reduced-motion`.
- Match the surrounding code: plain-language comments in the existing voice, and the same naming and idioms.
- Spanish and French patterns never use `\b` next to letters that may be accented (JS `\b` is ASCII-only). Use
  `(?<!\p{L})` and `(?!\p{L})` with the `u` flag.

## Review Focus

1. **Accented letters at a word edge.** "Ya terminé", "Je suis fatiguée", "Adiós". An ASCII `\b` silently fails, so
   leaving or resting isn't detected. Pinned in Task 2's `asksToLeave` and rest tests.
2. **A short reply in Automatic** ("ok", "sí, vamos", a name) must not flip the conversation language. Pinned in
   Task 1's `nextConversationLanguage` tests.
3. **Claude answers a language outside the three** (Hindi, Japanese). The conversation language stays put, the reply
   is spoken with that language's code, and the fixed lines don't change. Pinned in Task 1 (unsupported claim) and
   Task 2 (`resolveReply` speaks in `ja`).
4. **A plan intro or photo caption made before the person switched language.** The companion says the localised
   generic line rather than mixing languages. Pinned in Task 1 (`sameLanguage`) and Task 7 (the intro and caption
   guards).
5. **An unsafe Spanish reply.** It falls back to an offline reply in the *final* conversation language, even when the
   offline guess was computed for another language. Pinned in Task 2 (`safeReply` with an English reading, and
   `resolveReply` falling back in Spanish after an English turn).

---

### Task 1: Language basics

**Files:**
- Create: `packages/shared/src/language.ts`
- Test: `tests/smoke/companion-language.test.ts` (create)

**Interfaces:**
- Produces:
  - `type Lang = 'en' | 'es' | 'fr'`
  - `type LanguageSetting = 'auto' | Lang`
  - `LANGS: readonly Lang[]`
  - `LANGUAGE_SETTINGS: readonly LanguageSetting[]`
  - `LANGUAGE_NAME: Record<Lang, string>` (English / Spanish / French)
  - `NATIVE_NAME: Record<Lang, string>` (English / Español / Français)
  - `BCP47: Record<Lang, string>` (`en-US`, `es-MX`, `fr-FR`)
  - `MIN_SWITCH_WORDS = 3`
  - `asLang(code: string | null | undefined): Lang | null`
  - `deviceLang(tag: string | null | undefined): Lang`
  - `detectLanguage(text: string): Lang | null`
  - `sameLanguage(text: string, lang: Lang): boolean`
  - `initialConversationLanguage(setting: LanguageSetting, deviceTag: string | null | undefined): Lang`
  - `nextConversationLanguage(current: Lang, setting: LanguageSetting, heard: { claimed: string | null | undefined; text: string }): Lang`

- [ ] **Step 1: Install the worktree's dependencies**

Run: `npm ci && npm --prefix apps/gate ci`
Expected: both complete without errors.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/smoke/companion-language.test.ts
import { describe, expect, test } from 'vitest';
import { asLang, detectLanguage, deviceLang, initialConversationLanguage, nextConversationLanguage, sameLanguage } from '../../packages/shared/src/language';

describe('language basics', () => {
  test('detects English, Spanish and French sentences', () => {
    expect(detectLanguage('La cometa era roja y mi abuela la hizo con papel de seda')).toBe('es');
    expect(detectLanguage('Le cerf-volant était rouge et ma grand-mère l’avait fait avec du papier')).toBe('fr');
    expect(detectLanguage('The kite was red and my grandmother made it with tissue paper')).toBe('en');
  });
  test('is unsure about short or neutral words', () => {
    for (const t of ['ok', 'mm', 'Rosa', '']) expect(detectLanguage(t), t).toBeNull();
  });
  test('reads codes and device tags', () => {
    expect(asLang('es-MX')).toBe('es'); expect(asLang('FR')).toBe('fr'); expect(asLang('pt')).toBeNull(); expect(asLang(null)).toBeNull();
    expect(deviceLang('fr-CA')).toBe('fr'); expect(deviceLang('de-DE')).toBe('en'); expect(deviceLang(undefined)).toBe('en');
    expect(initialConversationLanguage('auto', 'es-ES')).toBe('es'); expect(initialConversationLanguage('fr', 'en-US')).toBe('fr');
  });
  test('a pinned language always wins', () => {
    expect(nextConversationLanguage('en', 'es', { claimed: 'en', text: 'I want to go home now please' })).toBe('es');
  });
  test('Automatic follows what Claude heard, from three words up', () => {
    expect(nextConversationLanguage('en', 'auto', { claimed: 'fr', text: 'La maison de ma grand-mère' })).toBe('fr');
    expect(nextConversationLanguage('es', 'auto', { claimed: 'en', text: 'ok' })).toBe('es');
    expect(nextConversationLanguage('en', 'auto', { claimed: 'es', text: 'Sí, vamos' })).toBe('en');
  });
  test('a language outside the three never changes the conversation language', () => {
    expect(nextConversationLanguage('es', 'auto', { claimed: 'hi', text: 'मेरी दादी का घर बहुत सुंदर था' })).toBe('es');
  });
  test('without a claim the detector decides, else nothing changes', () => {
    expect(nextConversationLanguage('en', 'auto', { claimed: null, text: 'La cometa era roja y mi abuela la hizo' })).toBe('es');
    expect(nextConversationLanguage('fr', 'auto', { claimed: null, text: 'Rosa Maria Lopez Garcia' })).toBe('fr');
  });
  test('sameLanguage is false only for text confidently in another language', () => {
    expect(sameLanguage('Aquí estamos.', 'es')).toBe(true);
    expect(sameLanguage('Here we are. The little path, and the old oak at the bend.', 'es')).toBe(false);
    expect(sameLanguage('Mm.', 'fr')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts`
Expected: FAIL, because `language.ts` doesn't exist.

- [ ] **Step 4: Implement `packages/shared/src/language.ts`**

`detectLanguage` is a common-word count:

- **Tokens:** `text.toLowerCase().normalize('NFKC').split(/[^\p{L}]+/u)`, without empties.
- **Score per language:** one point per token in its word set, plus one point for each distinct marker character in
  the lowercased text.
  - Spanish markers: `ñ ¿ ¡ á í ó ú`.
  - French markers: `ç œ è ê à ù â î ô û ë ï`.
- **Result:** the top language when its score is at least 2 and at least 1 more than the runner-up; otherwise `null`.
- **Word sets** (overlaps are intended; the margin rule cancels them):
  - **es:** el la los las un una unos unas y que de del al con por para es era eran estaba había mi mis su sus muy pero
    como cuando donde yo nosotros tenía casa abuela abuelo sí también aquí allí porque qué cómo está estoy quiero vamos
    ahora me nos se lo le
  - **fr:** le la les un une des de du au aux et est était étaient avait avec pour dans sur mon ma mes son sa ses très
    mais comme quand où je j nous vous il elle c qu l d oui aussi ici là parce maison grand mère chez pas ne veux allons
    maintenant ai ce ça
  - **en:** the a an and was were is are with my our his her there this that it we i you had have of to in on at by from
    house grandma grandmother yes also here because what how want now very but when where me made

`nextConversationLanguage` works in this order:

1. A pinned setting returns the setting.
2. Fewer than `MIN_SWITCH_WORDS` whitespace-separated words returns `current`.
3. `asLang(claimed)` returns that language when it is one of the three.
4. Any other non-empty `claimed` returns `current`.
5. Otherwise `detectLanguage(text) ?? current`.

The other helpers:

- `sameLanguage(text, lang)`: `detectLanguage(text)` is `null` or equals `lang`.
- `deviceLang(tag)`: `asLang(tag) ?? 'en'`.

Give the file a header comment in the repo's voice, explaining that the conversation language follows the person in
Automatic.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/language.ts tests/smoke/companion-language.test.ts
git commit -m "Language basics: detect English, Spanish or French; the conversation follows the person"
```

---

### Task 2: The guide in three languages

**Files:**
- Modify: `packages/shared/src/guide.ts`
- Test: `tests/smoke/companion-language.test.ts` (append)

**Interfaces:**
- Consumes: `Lang`, `LanguageSetting`, `LANGUAGE_NAME` from Task 1.
- Produces:
  - `GuideInput` gains optional `language?: Lang` (the conversation language) and `setting?: LanguageSetting`.
  - `GuideReply` gains three fields:
    - `language: string | null`: ISO 639-1 code of the person's latest words.
    - `english: string | null`: an English reading of their words when not English.
    - `replyEnglish: string | null`: an English reading of the reply when not English.
  - `safeReply(reply: string, fallback: string, english?: string | null): string`
  - `languageLines(i: Pick<GuideInput, 'language' | 'setting'>): string`
  - `asksToLeave` and `asksToEnter` keep their signatures.
  - `guideOffline` returns `language: input.language ?? 'en'`, `english: null`, `replyEnglish: null`.
  - `resolveReply(input: GuideInput & { language: Lang; setting: LanguageSetting }, online: GuideReply | null): { reply: GuideReply; language: Lang; speakIn: string }`
    is the turn's language decision, kept pure so it is tested here and used by the Gate (Task 7). It returns:
    - `language`: the next conversation language.
    - `speakIn`: the code Sonic gets for this reply.
    - `reply`: the safe reply, or the offline one in the next language.

- [ ] **Step 1: Append the failing tests**

```ts
import { asksToEnter, asksToLeave, guideOffline, languageLines, resolveReply, safeReply, type GuideInput } from '../../packages/shared/src/guide';
const base: GuideInput = { phase: 'gathering', transcript: '', history: [], media: null, mediaCaption: null, place: null, invitedToEnter: false, turnsInPhase: 0 };

describe('the guide in three languages', () => {
  test('leaving is understood in Spanish and French, accents included', () => {
    for (const t of ['Quiero irme', 'Me quiero ir a casa', 'Ya terminé', 'Estoy cansada', 'Adiós', 'Llévame a casa',
      'Je voudrais partir', 'Je suis fatiguée', 'Au revoir', 'On peut s’en aller ?', 'Ramenez-moi à la maison']) expect(asksToLeave(t), t).toBe(true);
  });
  test('memories that mention leaving are not a wish to leave', () => {
    for (const t of ['Dejábamos la puerta abierta cuando nos íbamos', 'Mi abuelo quería irse a México',
      'On partait le dimanche après la messe', 'Il voulait partir en Espagne']) expect(asksToLeave(t), t).toBe(false);
  });
  test('invitations to step through are recognised in each language', () => {
    for (const t of ['¿Vamos allí juntos?', 'On y va ensemble ?', 'Shall we go there together?']) expect(asksToEnter(t), t).toBe(true);
    for (const t of ['Vamos a ver qué más había', 'Aquí estamos.']) expect(asksToEnter(t), t).toBe(false);
  });
  test('the safety filter holds in Spanish and French, and through the English reading', () => {
    for (const t of ['Esto puede curar la demencia.', 'Ce traitement aide la mémoire.', '¿Se acuerda de qué año era?', 'Vous vous souvenez de quelle année c’était ?'])
      expect(safeReply(t, 'fb'), t).toBe('fb');
    expect(safeReply('Qué cortinas tan bonitas.', 'fb')).toBe('Qué cortinas tan bonitas.');
    expect(safeReply('भगवान आपका भला करे', 'fb', 'This medicine will cure your memory loss')).toBe('fb');
    expect(safeReply('Qué bonito.', 'fb', 'How lovely.')).toBe('Qué bonito.');
  });
  test('offline replies come in the conversation language', () => {
    expect(guideOffline({ ...base, language: 'es', transcript: 'Quiero irme', phase: 'memory' })).toMatchObject({ intent: 'leave', reply: 'Gracias por traerme aquí. Guardaré este momento para usted.', language: 'es' });
    expect(guideOffline({ ...base, language: 'es', transcript: 'Descansemos un momento' })).toMatchObject({ intent: 'rest', reply: 'Por supuesto. Descansemos aquí un momento.' });
    expect(guideOffline({ ...base, language: 'fr', transcript: 'J’ai une photo de la maison' })).toMatchObject({ intent: 'offer_photo' });
    expect(guideOffline({ ...base, language: 'es', transcript: 'No sé' }).intent).toBe('offer_invite');
    expect(guideOffline({ ...base, language: 'es', invitedToEnter: true, transcript: 'Sí, vamos' })).toMatchObject({ intent: 'enter', reply: 'Venga conmigo.' });
    expect(guideOffline({ ...base, language: 'fr', invitedToEnter: true, transcript: 'Pas encore' })).toMatchObject({ intent: 'chat', reply: 'Bien sûr. Racontez-m’en plus quand vous voulez.' });
    const long = 'La casa de mi abuela tenía una cocina grande con cortinas amarillas y una mesa de madera';
    expect(guideOffline({ ...base, language: 'es', transcript: long })).toMatchObject({ intent: 'describe', reply: 'Ya casi puedo verlo. ¿Vamos allí juntos?' });
    expect(guideOffline({ ...base, language: 'es', phase: 'memory', transcript: 'Mm' }).reply).toMatch(/^(Mm\. Aquí estoy\.|Tómese su tiempo\.|Le escucho\.)$/);
  });
  test('English offline replies are unchanged', () => {
    const r = guideOffline({ ...base, transcript: 'My grandmother’s kitchen in the morning, with yellow curtains, a round wooden table and her radio on the counter' });
    expect(r).toMatchObject({ intent: 'describe', language: 'en', english: null, replyEnglish: null });
    expect(r.reply).toMatch(/^I can almost see .*Shall we go there together\?$/);
  });
  test('resolveReply: a language outside the three is spoken as is and changes nothing else', () => {
    const r = resolveReply({ ...base, language: 'es', setting: 'auto', transcript: 'मेरी दादी का घर बहुत सुंदर था' },
      { reply: 'कितना सुंदर घर था।', intent: 'chat', place: null, language: 'hi', english: 'My grandmother’s house was very beautiful', replyEnglish: 'What a beautiful house.' });
    expect(r).toMatchObject({ language: 'es', speakIn: 'hi' });
    expect(r.reply.reply).toBe('कितना सुंदर घर था।');
  });
  test('resolveReply: an unsafe reply falls back in the language just heard', () => {
    const r = resolveReply({ ...base, language: 'en', setting: 'auto', transcript: 'La casa de mi abuela tenía una cocina grande' },
      { reply: 'Esto puede curar la demencia.', intent: 'describe', place: null, language: 'es', english: 'My grandmother’s house had a big kitchen', replyEnglish: 'This can cure dementia.' });
    expect(r).toMatchObject({ language: 'es', speakIn: 'es' });
    expect(r.reply.reply).not.toMatch(/curar/);
    expect(sameLanguage(r.reply.reply, 'es')).toBe(true);
  });
  test('resolveReply: a pinned language is what Sonic speaks; no reply means offline in the guessed language', () => {
    expect(resolveReply({ ...base, language: 'fr', setting: 'fr', transcript: 'I loved the garden behind the house' },
      { reply: 'Le jardin derrière la maison, comme c’est joli.', intent: 'describe', place: null, language: 'en', english: '', replyEnglish: 'The garden behind the house, how lovely.' }).speakIn).toBe('fr');
    const off = resolveReply({ ...base, language: 'en', setting: 'auto', transcript: 'La cometa era roja y mi abuela la hizo' }, null);
    expect(off).toMatchObject({ language: 'es', speakIn: 'es' });
    expect(off.reply.language).toBe('es');
  });
  test('the prompt names the language rule for each setting', () => {
    expect(languageLines({ setting: 'es' })).toContain('always reply in Spanish');
    const auto = languageLines({ setting: 'auto', language: 'fr' });
    expect(auto).toContain('language of their latest words');
    expect(auto).toContain('French');
    for (const s of [languageLines({ setting: 'en' }), auto]) expect(s).toContain('reply_english');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts`
Expected: FAIL. The new exports and fields are missing, and the Spanish and French phrases aren't recognised.

- [ ] **Step 3: Implement the changes in `packages/shared/src/guide.ts`**

1. **Types:** add the `GuideInput` and `GuideReply` fields from the Interfaces block.

2. **`safeReply(reply, fallback, english?)`:** keep the link stripping and the 34-word cap. Add `MEDICAL_ES_FR` and
   `QUIZ_ES_FR`. Return `fallback` when the reply fails any pattern, or when `english` is given and fails `MEDICAL`
   or `QUIZ`.
   - `MEDICAL_ES_FR`: cura/curar/curación, sanar, tratamiento, terapia, diagnóstico, demencia, alzhéimer,
     pérdida de memoria, medicación/medicamento, síntoma, mejorar la memoria; guérir/guérison, traitement, thérapie,
     diagnostic, démence, perte de mémoire, médicament, symptôme, améliorer la mémoire.
   - `QUIZ_ES_FR`: "(se acuerda|te acuerdas|recuerda|recuerdas) (de) (qué|quién|cuándo|cuál|el año|la fecha)",
     "intente/inténtelo recordar", "está equivocado/a | se equivoca | eso no es (así|correcto|verdad)",
     "(vous vous souvenez|tu te souviens|souvenez-vous) (de|du|des) (quoi|qui|quand|quel|quelle|l’année|la date)",
     "essayez de vous souvenir/rappeler", "vous vous trompez | ce n’est pas (vrai|correct|exact)".

3. **`asksToLeave`:** add Spanish and French alternatives, built like the English ones (a wish plus a go-verb; a few
   standalone openings; a few anywhere phrases). Use the Unicode boundaries from Global Constraints. It runs on
   `norm(transcript)`, which keeps apostrophes (’ becomes ') but turns hyphens into spaces. So write "ramenez moi",
   "pouvons nous" and "allons y" in these patterns and in `guideOffline`'s keyword patterns. Hyphens stay in
   `asksToEnter` and `safeReply`, which test the raw reply.
   - **es wish:** quiero, quisiera, me gustaría, necesito, podemos, podríamos, me quiero, ya me quiero
   - **es go:** irme, irnos, ir, salir, parar, terminar, acabar, volver, regresar, despedirme
   - **es standalone:** adiós, chao, me voy, nos vamos, vámonos, ya está, ya terminé, basta, eso es todo
   - **es anywhere:** llévame (a casa | de vuelta), sácame de aquí, estoy (muy) cansado/a, por hoy basta
   - **fr wish:** je voudrais, je veux, je dois, j’aimerais, on peut, on pourrait, pouvons-nous, il est temps de
   - **fr go:** partir, y aller, arrêter, sortir, finir, terminer, rentrer, m’en aller, s’en aller, nous en aller,
     dire au revoir
   - **fr standalone:** au revoir, c’est fini, j’ai fini, on a fini, ça suffit, c’est tout, arrêtons
   - **fr anywhere:** ramenez-moi, je suis (très) fatigué/e, ça suffit pour (aujourd’hui | maintenant)

4. **`asksToEnter`:** keep the English pattern and add these, case-insensitive with the `u` flag:
   - es: `(vamos|vayamos) (allí|alli|juntos|juntas|a verlo|a ese lugar)`, `quiere (ir|que vayamos|entrar|pasar)`,
     `le gustaría (ir|entrar|pasar)`
   - fr: `on y va`, `allons-y`, `(voulez|aimeriez)-vous (y aller|entrer|y entrer)`, `si on y allait`

5. **`guideOffline`:** move every reply into one `OFFLINE: Record<Lang, {...}>` table. Use the English strings exactly
   as they are today, and the Spanish and French copy below. Pick with `input.language ?? 'en'`. Intent keywords test
   the English pattern **or** that language's pattern below, with Unicode boundaries.

   | intent check | es | fr |
   |---|---|---|
   | rest (≤ 8 words) | descansar, descansemos, una pausa, un momento, espere, espéreme | repos, reposer, reposons, une pause, un moment, attendez |
   | video | vídeo, video, grabación, película | vidéo, enregistrement, film |
   | photo | foto(s), fotografía(s), imagen, imágenes, álbum, retrato(s) | photo(s), photographie(s), image(s), album |
   | unsure | no sé, no estoy seguro/a, no me acuerdo, no recuerdo, ni idea | je ne sais pas, je sais pas, pas sûr/e, je ne me souviens pas, aucune idée, euh |
   | yes (start) | sí, si, claro, vale, de acuerdo, vamos, por favor, me encantaría, bueno | oui, d’accord, bien sûr, allons-y, on y va, volontiers, avec plaisir |
   | not yet (start) | no, todavía no, aún no, espere, espera | non, pas encore, attendez, attends |

   Copy (keep the English entries as today):

   | key | es | fr |
   |---|---|---|
   | leaveMemory | Gracias por traerme aquí. Guardaré este momento para usted. | Merci pour ce moment ici. Je le garderai précieusement pour vous. |
   | leaveGate | Por supuesto. Gracias por pasar este rato conmigo. | Bien sûr. Merci d’avoir passé ce moment avec moi. |
   | rest | Por supuesto. Descansemos aquí un momento. | Bien sûr. Reposons-nous ici un instant. |
   | listening[] | Mm. Aquí estoy. / Tómese su tiempo. / Le escucho. | Mm. Je suis là. / Prenez votre temps. / Je vous écoute. |
   | addDetail[] | Ahora lo veo. / Sí. Pongámoslo aquí. / Ahí está. / Así se siente como en casa. | Je le vois maintenant. / Oui. Mettons-le ici. / Le voilà. / On se sent comme chez soi. |
   | video | Un vídeo sería precioso. Elija uno cuando quiera, o déjelo aquí mismo. | Une vidéo, ce serait merveilleux. Choisissez-en une quand vous voulez, ou déposez-la ici. |
   | photo | Qué bien. Elija una foto cuando quiera, o déjela aquí mismo. | Merveilleux. Choisissez une photo quand vous voulez, ou déposez-la ici. |
   | unsure | No pasa nada. Podemos mirar una foto juntos, o alguien que esté con usted puede enviar una desde su teléfono. | Ce n’est pas grave. Nous pourrions regarder une photo ensemble, ou quelqu’un près de vous peut en envoyer une depuis son téléphone. |
   | enter | Venga conmigo. | Venez avec moi. |
   | notYet | Por supuesto. Cuénteme más cuando quiera. | Bien sûr. Racontez-m’en plus quand vous voulez. |
   | describe (with or without a place) | Ya casi puedo verlo. ¿Vamos allí juntos? | Je le vois presque. On y va ensemble ? |
   | ask[] | Suena precioso. ¿Qué ve cuando se lo imagina? / Mm. Cuénteme cómo es allí. / Me encantaría verlo. ¿Qué hay a su alrededor? | Ça a l’air merveilleux. Que voyez-vous quand vous l’imaginez ? / Mm. Dites-moi à quoi ça ressemble. / J’aimerais tant le voir. Qu’y a-t-il autour de vous ? |

6. **`languageLines(i)`:** two sentences.
   - **The rule:** with a pinned setting, `Language: always reply in <Name>, whatever language they use.`; in
     Automatic, `Language: reply in the language of their latest words (if you can't tell, <Name of i.language ?? 'en'>).`
     Follow it with `In Spanish address them as "usted", in French as "vous".`
   - **The second sentence:** `Also return language (the ISO 639-1 code of their latest words), english (a faithful
     English translation of their latest words, "" if they spoke English) and reply_english (a faithful English
     translation of your reply, "" if your reply is in English).`

7. **`GUIDE_SYSTEM`:** replace `Speak in their language.` with `Speak in the language the request names; in Spanish
   use usted and in French vous (in the grandchild's view, tú or tu is fine).` Nothing else changes.

8. **`resolveReply(input, online)`:**

   ```
   guess = nextConversationLanguage(input.language, input.setting, { claimed: null, text: input.transcript })
   no online → { reply: guideOffline({ ...input, language: guess }), language: guess, speakIn: guess }
   next     = nextConversationLanguage(input.language, input.setting, { claimed: online.language, text: input.transcript })
   fallback = guideOffline({ ...input, language: next })
   text     = safeReply(online.reply, fallback.reply, online.replyEnglish)
   speakIn  = text === fallback.reply ? next : input.setting !== 'auto' ? input.setting : (online.language ?? next)
   → { reply: { ...online, reply: text }, language: next, speakIn }
   ```

   ink-2's optional transcript `language` is not used. It isn't in Cartesia's documented schema, and the detector is
   the offline backstop.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole smoke suite and the root typecheck**

Run: `npm test && npm run typecheck`
Expected: all smoke tests pass. The typecheck reports errors only in `convex/guide.ts`, where `respond` lacks the new
`GuideReply` fields. Task 3 fixes them.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/guide.ts tests/smoke/companion-language.test.ts
git commit -m "The guide understands English, Spanish and French: safety, leaving, entering, offline replies"
```

---

### Task 3: The backend asks Claude for the language

**Files:**
- Modify: `convex/guide.ts` (`render`, `Out`, `respond`)
- Modify: `convex/sketch.ts` (`caption`, `plan`, `see`, `detail`)
- Modify: `packages/shared/src/scene.ts` (`planOffline`)
- Test: `tests/smoke/companion-language.test.ts` (append)

**Interfaces:**
- Consumes: `languageLines`, `GuideReply` (Task 2); `asLang`, `LANGUAGE_NAME`, `Lang` (Task 1).
- Produces:
  - `api.sketch.caption`, `api.sketch.plan`, `api.sketch.see` and `api.sketch.detail` each accept an optional
    `language: string`.
  - `planOffline(text, title?, opts: { seeds?: boolean; language?: Lang })`
  - `api.guide.respond` returns the full `GuideReply`.

- [ ] **Step 1: Append the failing tests**

```ts
import { planOffline } from '../../packages/shared/src/scene';
describe('offline introductions follow the language', () => {
  test('Spanish and French intros, English unchanged', () => {
    expect(planOffline('a kitchen with a table', 'La cocina de la abuela', { language: 'es' }).intro).toBe('Aquí estamos. La cocina de la abuela, tal como lo describió.');
    expect(planOffline('a kitchen with a table', null, { language: 'fr' }).intro).toBe('Nous y voilà, comme vous l’avez décrit.');
    expect(planOffline('a beach by the sea', null, { language: 'es' }).intro).toBe('Aquí estamos. ¿Siente el aire?');
    expect(planOffline('a beach by the sea', null, { language: 'fr' }).intro).toBe('Nous y voilà. Vous sentez l’air ?');
    expect(planOffline('a kitchen with a table', 'Grandma’s kitchen').intro).toBe('Here we are. Grandma’s kitchen, just as you described it.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts`
Expected: FAIL. The Spanish and French intros come out in English.

- [ ] **Step 3: Implement the changes**

- **`scene.ts`:** when `opts.language` is `es` or `fr`, the intro uses only the *given* title, never `inferTitle`,
  which returns English.
  - es indoor: `Aquí estamos. ${title}, tal como lo describió.`; without a title, `Aquí estamos, tal como lo describió.`
  - es outdoor: `Aquí estamos. ¿Siente el aire?`
  - fr indoor: `Nous y voilà. ${title}, comme vous l’avez décrit.`; without a title, `Nous y voilà, comme vous l’avez décrit.`
  - fr outdoor: `Nous y voilà. Vous sentez l’air ?`

  English is unchanged.
- **`convex/guide.ts`:**
  - `render` adds `languageLines(i)` before its last line, and that line becomes
    `Reply with JSON: reply, intent, place ("" if unknown), language, english, reply_english.`
  - `Out` adds `language`, `english` and `reply_english`, all `z.string()`.
  - `respond` returns `language` (the trimmed, lowercased value when it matches `/^[a-z]{2}$/`, else `null`),
    `english: cap(out.english, 600) || null` and `replyEnglish: cap(out.reply_english, 260) || null`.
- **`convex/sketch.ts`:**
  - Add `language: v.optional(v.string())` to the four actions' args.
  - Add a helper `languageNote(language: string | undefined, what: string): string`. It returns
    ` Write ${what} in ${LANGUAGE_NAME[l]}.` for `l = asLang(language)` when `l` is `es` or `fr`, else `''`.
  - Append the note to the existing request text:
    - `caption`: `'caption and title'`
    - `plan` and `see`: `'title and intro'`
    - `detail`: `'intro'`
  - Pass `{ language: asLang(a.language) ?? undefined }` to the `planOffline` fallbacks in `plan` and `see`.

- [ ] **Step 4: Run the tests and the root typecheck**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts && npm run typecheck`
Expected: PASS. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add convex/guide.ts convex/sketch.ts packages/shared/src/scene.ts tests/smoke/companion-language.test.ts
git commit -m "Claude returns the person's language and English readings; captions and intros in that language"
```

---

### Task 4: The voice: Ariana, a language for every line, emotion only in English

**Files:**
- Modify: `apps/headset/src/voice/tts.ts` (export `generationConfig`, use it in `request`)
- Modify: `apps/headset/src/voice/index.ts` (`VoiceOptions.voiceId`)
- Modify: `apps/gate/src/voice/engine.ts`
- Test: `tests/smoke/companion-language.test.ts` (append)

**Interfaces:**
- Produces:
  - `generationConfig(language: string | null): { speed: number; emotion?: string }`
  - `VoiceOptions.voiceId?: string`: when set, used for TTS instead of the minted `voiceId`.
  - In `engine.ts`:
    - `GATE_VOICE_ID = 'ec1e269e-9ca0-402f-8a18-58e0e022355a'`
    - `VoiceEngine.say(text: string, language?: string | null): Promise<void>`
    - `createEngine(session, ev, opts: { recognitionLang: () => string }): Promise<VoiceEngine>`

- [ ] **Step 1: Append the failing test**

```ts
import { generationConfig } from '../../apps/headset/src/voice/tts';
test('emotion is sent only with English lines', () => {
  expect(generationConfig('en')).toEqual({ speed: 0.95, emotion: 'calm' });
  expect(generationConfig(null)).toEqual({ speed: 0.95, emotion: 'calm' });
  expect(generationConfig('es')).toEqual({ speed: 0.95 });
  expect(generationConfig('fr')).toEqual({ speed: 0.95 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts`
Expected: FAIL, because `generationConfig` isn't exported.

- [ ] **Step 3: Implement the changes**

- **`tts.ts`:** add `generationConfig`, used for the request body's `generation_config`. Add a comment that Sonic's
  emotion control is English-only (beta).
- **`index.ts`:** add the optional `voiceId` to `VoiceOptions`, with a doc comment saying the Gate companion uses
  Ariana and the headset keeps the room's voice. `ttsAuth()` uses `opts.voiceId ?? mint.voiceId`. Update the header
  comment's `speak(text)` line to mention the optional language.
- **`engine.ts`:**
  - `cartesiaEngine` passes `voiceId: GATE_VOICE_ID` to `createVoice`. `say(text, language)` calls
    `voice.speak(text, { language: language ?? null })`.
  - `browserEngine(ev, recognitionLang)` sets `r.lang = recognitionLang()` at each `startRec`.
  - `pickVoice(language?: string | null)` prefers a system voice whose `lang` starts with the language code, then
    today's English list. `say` sets `u.lang` from that language.
  - `silentEngine().say` accepts and ignores the language.
  - `createEngine` takes the new `opts` and passes `opts.recognitionLang` to the browser engine.
  - Add a line to the header comment naming Ariana and why: one voice native in all three languages.

- [ ] **Step 4: Run the test and the Gate typecheck**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts && npm --prefix apps/gate run typecheck`
Expected: the test passes. The Gate typecheck reports only that `createEngine`'s call in `controller.ts` lacks
`opts`, which Task 7 fixes.

- [ ] **Step 5: Commit**

```bash
git add apps/headset/src/voice/tts.ts apps/headset/src/voice/index.ts apps/gate/src/voice/engine.ts tests/smoke/companion-language.test.ts
git commit -m "Gate voice: Ariana in every language, each line's language to Sonic, emotion only in English"
```

---

### Task 5: The companion's fixed lines in three languages

**Files:**
- Create: `apps/gate/src/flow/lines.ts`
- Test: `tests/smoke/companion-language.test.ts` (append)

**Interfaces:**
- Consumes: `Lang`, `sameLanguage` (Task 1); `PlaceKey` from `packages/shared/src/places.ts`.
- Produces:
  - `LINES` (a const object keyed by the line keys below, each `Record<Lang, string>`, declared with `satisfies`)
  - `type LineKey = keyof typeof LINES`
  - `line(key: LineKey, lang: Lang, vars?: Record<string, string>): string`, which replaces each `{name}`
  - `PLACE_INTROS: Partial<Record<PlaceKey, { es: string; fr: string }>>`

- [ ] **Step 1: Append the failing tests**

```ts
import { LANGS } from '../../packages/shared/src/language';
import { LINES, PLACE_INTROS, line } from '../../apps/gate/src/flow/lines';
describe('the companion’s fixed lines', () => {
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  test('every line exists in all three languages with the same placeholders', () => {
    for (const [key, v] of Object.entries(LINES)) for (const l of LANGS) {
      expect(v[l], `${key}.${l}`).toBeTruthy();
      expect(holes(v[l]), `${key}.${l}`).toEqual(holes(v.en));
    }
  });
  test('no Spanish or French line was left in English', () => {
    for (const [key, v] of Object.entries(LINES)) { expect(sameLanguage(v.es, 'es'), key).toBe(true); expect(sameLanguage(v.fr, 'fr'), key).toBe(true); }
  });
  test('English lines are word for word as today', () => {
    expect(LINES.hello.en).toBe('Hello. I’m so glad you’re here.');
    expect(LINES.tellMeMore.en).toBe('Tell me what else was here, or anything you notice. Say when you’d like to leave.');
  });
  test('placeholders are filled', () => {
    expect(line('seeCaption', 'es', { caption: 'una cocina soleada' })).toBe('Veo una cocina soleada. ¿Dónde es este lugar?');
  });
  test('both prepared places have Spanish and French introductions', () => {
    for (const k of ['courtyard', 'red-kite'] as const) { expect(PLACE_INTROS[k]?.es).toBeTruthy(); expect(PLACE_INTROS[k]?.fr).toBeTruthy(); }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts`
Expected: FAIL, because `lines.ts` doesn't exist.

- [ ] **Step 3: Create `apps/gate/src/flow/lines.ts` with this exact copy**

The English entries are today's literals from `controller.ts`, character for character.

| key | en | es | fr |
|---|---|---|---|
| welcomeGuest | Welcome. You’re joining {host}. Whatever you share, they’ll see it too. | Le doy la bienvenida. Se une a {host}. Lo que comparta, también lo verán. | Bienvenue. Vous rejoignez {host}. Tout ce que vous partagerez, ils le verront aussi. |
| hello | Hello. I’m so glad you’re here. | Hola. Qué alegría que esté aquí. | Bonjour. Quel bonheur de vous voir ici. |
| askMoment | Is there a moment you’d like to visit today? You can tell me about it, or show me a photo. | ¿Hay algún momento que le gustaría visitar hoy? Puede contármelo o mostrarme una foto. | Y a-t-il un moment que vous aimeriez revisiter aujourd’hui ? Vous pouvez me le raconter, ou me montrer une photo. |
| missed | I’m sorry, I missed that. Could you say it again? | Perdone, no lo he oído bien. ¿Podría repetirlo? | Pardon, je n’ai pas bien entendu. Pourriez-vous répéter ? |
| goodbyeGate | Of course. Thank you for spending this time with me. | Por supuesto. Gracias por pasar este rato conmigo. | Bien sûr. Merci d’avoir passé ce moment avec moi. |
| tooLarge | That one is a little too large for me. A smaller copy would be perfect. | Esa es un poco grande para mí. Una copia más pequeña sería perfecta. | Celle-ci est un peu trop grande pour moi. Une copie plus petite serait parfaite. |
| cantOpen | I couldn’t open that one. Could you try another? | No he podido abrir esa. ¿Podría probar con otra? | Je n’ai pas pu ouvrir celle-ci. Pourriez-vous en essayer une autre ? |
| loveVideo | Oh, I love this. | Ay, me encanta. | Oh, j’adore. |
| lookPhoto | Oh, look at this. | Ay, mire esto. | Oh, regardez ça. |
| seeCaption | I can see {caption}. Where is this place? | Veo {caption}. ¿Dónde es este lugar? | Je vois {caption}. Où est cet endroit ? |
| wherePlace | Where is this place? | ¿Dónde es este lugar? | Où est cet endroit ? |
| comingBack | It’s coming back to me, little by little. | Poco a poco, va apareciendo. | Ça revient, petit à petit. |
| hereWeAre | Here we are. | Aquí estamos. | Nous y voilà. |
| tellMeMore | Tell me what else was here, or anything you notice. Say when you’d like to leave. | Cuénteme qué más había aquí, o lo que vea. Dígame cuando quiera irse. | Racontez-moi ce qu’il y avait d’autre ici, ou ce que vous remarquez. Dites-moi quand vous voudrez partir. |
| restDefault | Of course. Let’s rest here for a moment. | Por supuesto. Descansemos aquí un momento. | Bien sûr. Reposons-nous ici un instant. |
| resume | I’m here whenever you’re ready. | Aquí estoy, cuando usted quiera. | Je suis là, quand vous voulez. |
| thanksLeaving | Thank you for taking me there. I’ve kept this moment for you. | Gracias por llevarme allí. He guardado este momento para usted. | Merci pour ce voyage. J’ai gardé ce moment pour vous. |
| familyVisiting | {name} is visiting {place}. Let’s go with them. | {name} está visitando {place}. Vamos con ellos. | {name} visite {place}. Allons-y avec eux. |
| yourFamily | Your family | Su familia | Votre famille |
| someone | Someone | Alguien | Quelqu’un |
| sentPhoto | {name} sent a photo. Oh, look at this. | {name} ha enviado una foto. Ay, mire esto. | {name} a envoyé une photo. Oh, regardez ça. |
| hereAgain | Here we are again. | Aquí estamos otra vez. | Nous revoilà. |
| whereNext | Where would you like to go next? | ¿Adónde le gustaría ir ahora? | Où aimeriez-vous aller maintenant ? |
| nudgeMedia | Take your time. Whenever you’re ready, we can step inside. | Tómese su tiempo. Cuando quiera, podemos entrar. | Prenez votre temps. Quand vous voulez, nous pouvons entrer. |
| nudgePhoto | Take your time. If it’s easier, a photo can help us find the way. | Tómese su tiempo. Si le resulta más fácil, una foto puede ayudarnos a encontrar el camino. | Prenez votre temps. Si c’est plus facile, une photo peut nous aider à trouver le chemin. |
| shallWeSee | Shall we go and see it? | ¿Vamos a verlo? | On va le voir ? |
| noHurry | There’s no hurry. I’m right here. | No hay prisa. Aquí estoy. | Rien ne presse. Je suis là. |
| ourVisit | Our visit. | Nuestra visita. | Notre visite. |

`PLACE_INTROS`:

| place | es | fr |
|---|---|---|
| courtyard | Aquí estamos. Las parras sobre la pérgola, y la piedra tibia. | Nous y voilà. La vigne sur la pergola, et la pierre tiède. |
| red-kite | Aquí estamos. El caminito, y el viejo roble en la curva. | Nous y voilà. Le petit chemin, et le vieux chêne dans le virage. |

If the "no line left in English" test flags a short line because the detector is confident it's English, rephrase
that line; don't weaken the test.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config tests/smoke/vitest.config.mjs tests/smoke/companion-language.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gate/src/flow/lines.ts tests/smoke/companion-language.test.ts
git commit -m "The companion's fixed lines in English, Spanish and French"
```

---

### Task 6: The setting: store, gear and panel

**Files:**
- Modify: `apps/gate/src/state/store.ts`
- Create: `apps/gate/src/ui/CompanionSettings.tsx`
- Modify: `apps/gate/src/ui/TopBar.tsx`, `apps/gate/src/ui/Overlay.tsx`, `apps/gate/src/ui/Icons.tsx`,
  `apps/gate/src/ui/Captions.tsx`, `apps/gate/src/styles/app.css`, `apps/gate/src/social/ui/SocialUI.tsx`
- Test: `apps/gate/scripts/language-check.mjs` (create)

**Interfaces:**
- Consumes: `LanguageSetting`, `Lang`, `LANGUAGE_SETTINGS`, `BCP47`, `NATIVE_NAME` (Task 1).
- Produces:
  - Store fields `language: LanguageSetting`, `settingsOpen: boolean` and `spoken: Lang`.
  - `setLanguage(setting: LanguageSetting): void`, which persists to `mg.gate.language` inside try/catch.
  - Exported `recognitionLang(): string`: the pinned language's `BCP47` tag, or `navigator.language || 'en-US'` in
    Automatic.
  - Components `SettingsButton` and `CompanionSettings`.
  - Test ids `open-settings`, `settings-sheet`, `language-auto`, `language-en`, `language-es`, `language-fr` and
    `settings-done`.

- [ ] **Step 1: Write the failing browser check (settings part)**

Model `apps/gate/scripts/language-check.mjs` on `apps/gate/scripts/flow.mjs`:

- **Setup:** same launch flags and `ignoreHTTPSErrors`. Default base `https://localhost:5190`, URL
  `${base}/?voice=off&mode=offline`.
- **Helpers:** a `check(name, ok, detail)` that records PASS or FAIL, and the same perspective-picker locator handler.
- **The settings check:**
  1. Open the page.
  2. Click `open-settings`, check `language-es`, click `settings-done`.
  3. Reload.
  4. Check `localStorage['mg.gate.language'] === 'es'`.
  5. Reopen the gear and check that `language-es` is checked.
  6. Choose Automatic again, so later checks start clean.
- **Exit:** print a summary, and exit with code 1 if any check failed.

- [ ] **Step 2: Start the worktree's Gate and run the check to verify it fails**

Run, in the background: `CONVEX_PROXY_TARGET=http://127.0.0.1:3212 GATE_PORT=5190 npm --prefix apps/gate run dev`. It
uses the existing local backend, offline rooms only, and never deploys.

Then run: `node apps/gate/scripts/language-check.mjs`
Expected: FAIL, because there is no `open-settings` button.

- [ ] **Step 3: Implement the changes**

- **Store:**
  - `language` initialises from `localStorage` (validated against `LANGUAGE_SETTINGS`, inside try/catch), else
    `'auto'`.
  - `spoken` initialises to `deviceLang(navigator.language)`. `settingsOpen` starts `false`.
- **`CompanionSettings.tsx`:**
  - `SettingsButton`: `button.icon-btn.glass`, `aria-label="Companion settings"`, with `GearIcon`. It opens the panel.
  - `CompanionSettings`: built on `InviteSheet`'s structure, with a backdrop of class `sheet-backdrop side`, a
    `section.sheet.glass.settings-sheet` (`role="dialog"`, `aria-modal`, `aria-labelledby`), a close button and the
    title "Your companion".
  - **The choices:** a `fieldset` legend "Language" with four native radio inputs (`name="language"`) styled as
    chips: Automatic, English, Español (`lang="es"`), Français (`lang="fr"`).
  - **The explanation**, one line under the choices:
    - auto: "Listens for English, Spanish and French, and answers in whichever it hears."
    - en: "Always speaks English."
    - es: "Always speaks Spanish · Siempre habla en español."
    - fr: "Always speaks French · Parle toujours en français."
  - **Done** closes the panel. Escape closes it. On open, focus goes to the checked radio; on close, back to the gear.
- **`Icons.tsx`:** `GearIcon`, the same stroke style as the other icons (the gear path from the mockup).
- **`TopBar`:** `{stage === 'portal' && <SettingsButton />}` sits before `MomentsButton` in `.right`, for hosts and
  guests.
- **`Overlay`:** mount `<CompanionSettings />` beside `<InviteSheet />`.
- **`Captions`:** `lang={spoken}` on the `.said` paragraph.
- **`SocialUI`** composer: `r.lang = recognitionLang()`.
- **`app.css`:**
  - Desktop: `.sheet-backdrop.side` aligns the sheet to the right edge below the top bar.
  - At ≤ 640 px: a bottom sheet.
  - `.settings-sheet`: left-aligned text, narrower title.
  - `.lang-choices`: wrapping pill chips; the checked chip has a solid porcelain background and dark ink, matching the
    mockup. The radio input is visually hidden but focusable, with a focus ring like `.icon-btn:focus-visible`.
  - Opacity transitions only, ≥ 0.4 s, disabled under reduced motion.

- [ ] **Step 4: Run the check and the Gate typecheck**

Run: `node apps/gate/scripts/language-check.mjs && npm --prefix apps/gate run typecheck`
Expected: every settings check passes. The typecheck reports only the `createEngine` call from Task 4.

- [ ] **Step 5: Commit**

```bash
git add apps/gate/src/state/store.ts apps/gate/src/ui/CompanionSettings.tsx apps/gate/src/ui/TopBar.tsx apps/gate/src/ui/Overlay.tsx apps/gate/src/ui/Icons.tsx apps/gate/src/ui/Captions.tsx apps/gate/src/styles/app.css apps/gate/src/social/ui/SocialUI.tsx apps/gate/scripts/language-check.mjs
git commit -m "A gear on the start page chooses the companion's language (Automatic, English, Español, Français)"
```

---

### Task 7: The conversation follows the language

**Files:**
- Modify: `apps/gate/src/flow/controller.ts`
- Modify: `apps/gate/src/flow/memory.ts` (`setLanguage`; `language` on the `sketch.plan`, `sketch.caption` and
  `sketch.detail` calls; `planOffline(..., { language })` in `plan()`)
- Modify: `apps/gate/src/flow/moments.ts` (`captureFinal(title, fallback)`)
- Test: `apps/gate/scripts/language-check.mjs` (extend)

**Interfaces:**
- Consumes:
  - From Task 1: `initialConversationLanguage`, `nextConversationLanguage`, `sameLanguage`.
  - From Task 2: `resolveReply`, the `GuideReply` fields.
  - From Task 4: `createEngine` opts and `say(text, language)`.
  - From Task 5: `line`, `PLACE_INTROS`.
  - From Task 6: store `language` and `spoken`, `recognitionLang`.
- Produces:
  - `Memory.setLanguage(lang: Lang): void`
  - `Moments.captureFinal(title: string | null, fallback: string): Promise<void>`

- [ ] **Step 1: Extend the browser check (conversation part)**

Add to `language-check.mjs`:

- **A pinned Spanish visit:**
  1. Choose Español in the gear, then Begin.
  2. The greeting `companionLine` matches `/Hola/`, and the next line matches `/momento/`.
  3. Hear `La casa de mi abuela tenía una cocina grande con cortinas amarillas y una mesa de madera`. The reply
     matches `/Ya casi puedo verlo|Suena precioso|Cuénteme|Me encantaría/`.
  4. Hear `Sí, vamos`. Wait for stage `memory`. A companion line matches `/Aquí estamos/`.
  5. Hear `Quiero irme`. Wait for stage `album`. A seen companion line matched `/Gracias por llevarme/`.

  Record every `companionLine` in a page-side array through `store.subscribe`. Then assert that no Spanish-visit line
  is confidently English: copy `detectLanguage` into the script, or fail on `/\b(the|you|here we are)\b/i`.
- **An Automatic visit:** a fresh browser context, then Begin; the greeting matches `/Hello/`. Hear
  `La maison de ma grand-mère avait une grande cuisine avec des rideaux jaunes et une table en bois`. The next
  companion line matches `/Je le vois presque|Ça a l’air|Dites-moi|J’aimerais/`.

- [ ] **Step 2: Run it to verify the new checks fail**

Run: `node apps/gate/scripts/language-check.mjs`
Expected: the settings checks pass. The Spanish and Automatic checks fail, because the lines are still English.

- [ ] **Step 3: Implement in `controller.ts`**

- **State:**
  - `private lang: Lang`.
  - `private setLang(l: Lang)` updates `this.lang`, the store's `spoken` and `memory.setLanguage(l)`.
  - `setup()` calls `setLang(initialConversationLanguage(g.language, navigator.language))`.
  - The constructor subscribes to the store, so a changed `language` setting calls the same.
- **`t(key, vars?) = line(key, this.lang, vars)`** replaces every English literal listed in Task 5.
  - `invite.host === 'your family'` (the `readInvite` default) uses `t('yourFamily')`.
  - The names in `followHost` and `welcomeGuestPhoto` fall back to `t('yourFamily')` and `t('someone')`.
  - `rest(line?)` defaults to `t('restDefault')`.
  - `moments.captureFinal(this.place, this.t('ourVisit'))`.
- **`say`:**
  - `say(text, opts?: { language?: string | null; whileResting?: boolean })` passes
    `opts?.language ?? this.lang` to `engine.say`.
  - Replace the `/rest|ready/i` test with `opts?.whileResting`, passed by the `rest()` and `resume()` lines.
- **`createEngine`:** pass `{ recognitionLang }`.
- **`ask()`:** returns `GuideReply & { speakIn: string }`.
  - It builds `input` with `language: this.lang` and `setting: g.language`, read before the turn.
  - It sends `input` to `guide.respond` only when there is a session, with the same 7 s `withTimeout`; otherwise
    `online` is `null`.
  - Then `const r = resolveReply(input, online); this.setLang(r.language); return { ...r.reply, speakIn: r.speakIn }`.
- **`heard()` / `heardInMemory()`:** every `say(reply.reply)` becomes `say(reply.reply, { language: reply.speakIn })`.
  - **Gathering:** keep `placeWords(text)` before `ask` (English timing unchanged). After `ask`,
    `if (reply.english) this.placeWords(reply.english)`.
  - **Memory:** keep `memory.bringIn(text)` before `ask`. After it,
    `if (!brought && reply.english) brought = memory.bringIn(reply.english)`, scheduling `moments.mark` as the early
    path does. The `add_detail` branch then uses the updated `brought`.
- **Intros (`enter()`):** for a prepared place (`useMemory.getState().place`) when `this.lang !== 'en'`, use
  `PLACE_INTROS[key]?.[lang] ?? t('hereWeAre')`. Otherwise use `memory.introLine() ?? t('hereWeAre')`, replaced by
  `t('hereWeAre')` when `!sameLanguage(intro, this.lang)`.
- **Photo captions** in `receiveFile` and `welcomeGuestPhoto`: when the caption fails `sameLanguage(caption, lang)`,
  use `t('wherePlace')` instead of `t('seeCaption', …)`.
- **`memory.ts`:** `private language: Lang = 'en'` and `setLanguage(lang)`. Pass `language: this.language` on the
  three sketch calls, and `{ language: this.language }` to the full-plan `planOffline`.
- **`moments.ts`:** `captureFinal(title, fallback)` uses `fallback` in place of `'Our visit.'`.

- [ ] **Step 4: Run the checks**

Run: `npm --prefix apps/gate run typecheck && node apps/gate/scripts/language-check.mjs`
Expected: the typecheck is clean, and every language check passes.

- [ ] **Step 5: English regression**

Run: `node apps/gate/scripts/flow.mjs apps/gate/.shots/flow-lang --base https://localhost:5190`
Expected: the walk completes to the album with no `pageerror`, and the companion lines are today's English ones.

- [ ] **Step 6: Commit**

```bash
git add apps/gate/src/flow/controller.ts apps/gate/src/flow/memory.ts apps/gate/src/flow/moments.ts apps/gate/scripts/language-check.mjs
git commit -m "The conversation follows the language: lines, replies, intros and captions in English, Spanish or French"
```

---

### Task 8: Whole-branch verification

**Files:** none (fixes go back to the owning task's files).

- [ ] **Step 1: Run the full fixture-only checks**

Run: `npm run typecheck && npm --prefix apps/gate run typecheck && npm test && npm --prefix apps/gate run build && node apps/gate/scripts/language-check.mjs`
Expected: every command exits 0. Smoke tests pass, including `companion-language.test.ts`.

- [ ] **Step 2: Look at the panel**

Run: `node apps/gate/scripts/shot.mjs "https://localhost:5190/?voice=off&mode=offline" apps/gate/.shots/settings.png --eval "document.querySelector('[data-testid=open-settings]').click()"`
Also run it with `--mobile`.
Expected: the glass panel sits at the right on desktop and at the bottom on a phone, readable over the palace, as in
the approved mockup.

- [ ] **Step 3: Stop the worktree's dev server.** Verify nothing listens on 5190 afterwards.
