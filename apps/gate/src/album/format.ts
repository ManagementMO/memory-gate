// Plain, warm words for when and how a memory happened ("This evening, from a photo you shared.").
import type { AlbumMemory, AlbumMoment } from './types';

const DAY_MS = 86_400_000;

function startOfDay(t: number): number { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

export function partOfDay(at: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = new Date(at).getHours();
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
}

/** "This evening", "Yesterday afternoon", "Tuesday morning", "On October 12". */
export function whenPhrase(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  const part = partOfDay(at);
  if (days <= 0) return part === 'night' ? 'Tonight' : `This ${part}`;
  if (days === 1) return part === 'night' ? 'Last night' : `Yesterday ${part}`;
  if (days < 7) return `${new Date(at).toLocaleDateString(undefined, { weekday: 'long' })} ${part}`;
  return `On ${new Date(at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
}

export function sourcePhrase(m: Pick<AlbumMemory, 'source'>): string {
  return m.source === 'photo' ? 'from a photo you shared' : m.source === 'video' ? 'from a video you shared' : 'from what you told the companion';
}

export function memoryLine(m: AlbumMemory, now = Date.now()): string {
  return `${whenPhrase(m.at, now)}, ${sourcePhrase(m)}.`;
}

export function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function todayLine(now = Date.now()): string {
  return new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const countWord = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n]! : String(n));

export function summaryLine(memories: AlbumMemory[]): string {
  const visits = memories.length;
  const moments = memories.reduce((n, m) => n + m.moments.length, 0);
  const v = `${countWord(visits)} ${visits === 1 ? 'visit' : 'visits'}`;
  const m = `${countWord(moments)} ${moments === 1 ? 'moment' : 'moments'}`;
  return `${v.charAt(0).toUpperCase()}${v.slice(1)}, ${m} kept.`;
}

/** What a moment was, in the album's voice. */
export function momentLabel(m: AlbumMoment): string {
  if (m.kind === 'arrival') return 'Arriving';
  if (m.kind === 'final') return 'Before leaving';
  return m.speaker === 'you' ? 'You remembered' : 'Your companion';
}
