// English readings travel with the original words and their speaker. Never assign a combined translation to one
// person in a mixed-language batch, or let somebody else's language change this device's preferred language.
import { asLang, detectLanguage, type Lang } from './language';

export type SpokenMemory = { id: string; memberId: string; name: string; text: string };
export type MemoryTranslation = { id: string; language: string | null; english: string | null };
export type TranslatedMemory = SpokenMemory & MemoryTranslation;

/** Display text only; an unavailable/invalid translation stays absent instead of repeating Spanish as English. */
export function englishText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 1800 || /https?:|www\./i.test(text)) return null;
  const detected = detectLanguage(text);
  return detected === 'es' || detected === 'fr' ? null : text;
}

export function translateMemories(words: SpokenMemory[], result: {
  translations?: MemoryTranslation[]; language?: string | null; english?: string | null;
} | null): TranslatedMemory[] {
  return words.map((word) => {
    const matches = (result?.translations ?? []).filter((t) => t.id === word.id);
    // Older backends return only the whole transcript's English reading. It is safe for exactly one utterance.
    const translated = matches.length === 1 ? matches[0] : words.length === 1 && matches.length === 0 ? result : null;
    const code = translated?.language?.trim().toLowerCase();
    const language = asLang(code) ?? (code && /^[a-z]{2}$/.test(code) ? code : detectLanguage(word.text));
    return { id: word.id, memberId: word.memberId, name: word.name, text: word.text, language,
      english: language && language !== 'en' ? englishText(translated?.english) : null };
  });
}

/** The listener's own language controls playback; a Spanish speaker can keep hearing Spanish. */
export function replyForListener(line: { text: string; speakIn?: string | null; language?: string | null; replyEnglish?: string | null }, listener: Lang): { text: string; language: string | null } {
  const language = line.speakIn ?? line.language ?? null;
  const english = listener === 'en' && language && asLang(language) !== 'en' ? englishText(line.replyEnglish) : null;
  return english ? { text: english, language: 'en' } : { text: line.text, language };
}

export function memoriesForListener(words: TranslatedMemory[], memberId: string | null, listener: Lang): TranslatedMemory[] {
  return listener === 'en' ? words.filter((w) => w.memberId !== memberId && w.language !== null && w.language !== 'en') : [];
}
