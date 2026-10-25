// Which language the companion speaks. A device can pin English, Spanish or French; in Automatic (the default) the
// conversation follows the person: it starts in the device's language and moves to whatever they speak, once they've
// said enough to tell. Short words ("ok", "sí", a name) never move it. Claude says which language it heard; the small
// common-word detector below stands in offline and as a backstop. Other languages Claude hears (ink-2 also knows
// Hindi and Japanese) are answered as they are, but never change the conversation language.

export type Lang = 'en' | 'es' | 'fr';
export type LanguageSetting = 'auto' | Lang;

export const LANGS: readonly Lang[] = ['en', 'es', 'fr'];
export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['auto', 'en', 'es', 'fr'];
/** For prompts ("always reply in Spanish"). */
export const LANGUAGE_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish', fr: 'French' };
/** For people, in each language's own words (the settings panel). */
export const NATIVE_NAME: Record<Lang, string> = { en: 'English', es: 'Español', fr: 'Français' };
/** Tags for the browser's own speech recognition. */
export const BCP47: Record<Lang, string> = { en: 'en-US', es: 'es-MX', fr: 'fr-FR' };
/** Fewer words than this never change the conversation language. */
export const MIN_SWITCH_WORDS = 3;

/** "es", "es-MX", "ES" → "es"; anything outside the three → null. */
export function asLang(code: string | null | undefined): Lang | null {
  const c = (code ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return (LANGS as readonly string[]).includes(c ?? '') ? (c as Lang) : null;
}

/** The device's language (navigator.language), English when it's none of the three. */
export function deviceLang(tag: string | null | undefined): Lang {
  return asLang(tag) ?? 'en';
}

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));
// Common words of each language. They overlap on purpose ("la", "de", "un"): the margin rule cancels shared words.
const WORDS: Record<Lang, Set<string>> = {
  es: words(`el la los las un una unos unas y que de del al con por para es era eran estaba había mi mis su sus muy pero
    como cuando donde yo nosotros tenía casa abuela abuelo sí también aquí allí porque qué cómo está estoy quiero vamos
    ahora me nos se lo le`),
  fr: words(`le la les un une des de du au aux et est était étaient avait avec pour dans sur mon ma mes son sa ses très
    mais comme quand où je j nous vous il elle c qu l d oui aussi ici là parce maison grand mère chez pas ne veux allons
    maintenant ai ce ça`),
  en: words(`the a an and was were is are with my our his her there this that it we i you had have of to in on at by from
    house grandma grandmother yes also here because what how want now very but when where me made`),
};
// Letters (and Spanish's opening marks) that belong to one of the two; each one present counts once.
const MARKS: Partial<Record<Lang, string[]>> = { es: [...'ñ¿¡áíóú'], fr: [...'çœèêàùâîôûëï'] };

/** English, Spanish or French when the words make it clear; null when unsure (short, neutral, or another language). */
export function detectLanguage(text: string): Lang | null {
  const lower = text.toLowerCase().normalize('NFKC');
  const tokens = lower.split(/[^\p{L}]+/u).filter(Boolean);
  const score = LANGS.map((l) => {
    let s = tokens.filter((t) => WORDS[l].has(t)).length;
    for (const m of MARKS[l] ?? []) if (lower.includes(m)) s += 1;
    return { l, s };
  }).sort((a, b) => b.s - a.s);
  const [top, next] = score;
  return top && top.s >= 2 && top.s - (next?.s ?? 0) >= 1 ? top.l : null;
}

/** False only when the text is confidently in another of the three (an old intro, a caption made before a switch). */
export function sameLanguage(text: string, lang: Lang): boolean {
  const d = detectLanguage(text);
  return d === null || d === lang;
}

/** Where a visit starts: the pinned language, or the device's language in Automatic. */
export function initialConversationLanguage(setting: LanguageSetting, deviceTag: string | null | undefined): Lang {
  return setting === 'auto' ? deviceLang(deviceTag) : setting;
}

/** The conversation language after the person spoke. `claimed` is the language Claude heard, when there is a reply. */
export function nextConversationLanguage(current: Lang, setting: LanguageSetting, heard: { claimed: string | null | undefined; text: string }): Lang {
  if (setting !== 'auto') return setting;
  if (heard.text.trim().split(/\s+/).filter(Boolean).length < MIN_SWITCH_WORDS) return current;
  const claimed = asLang(heard.claimed);
  if (claimed) return claimed;
  if (heard.claimed?.trim()) return current; // Hindi, Japanese…: answered as is, but the fixed lines stay put
  return detectLanguage(heard.text) ?? current;
}
