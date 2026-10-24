export function timeOf(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '\u00a0');
}

export function agoOf(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const LANGS: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', hi: 'Hindi', ja: 'Japanese', de: 'German', it: 'Italian', pt: 'Portuguese',
  zh: 'Chinese', ko: 'Korean', tl: 'Tagalog', vi: 'Vietnamese', pl: 'Polish', yi: 'Yiddish', ru: 'Russian', ar: 'Arabic',
};
export const languageName = (code: string | null | undefined) => (code ? LANGS[code] ?? code.toUpperCase() : null);

/** "ABC234" shown as "ABC 234" so it is easy to read aloud. */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

export const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
