// Two microphones in one room: each also hears the other person, faintly. When the same words arrive from both
// devices they're kept once, credited to the device that heard them loudest (the speaker's own, close to their
// mouth); quiet words that are only the other person heard from across the room are dropped. Loudness is the speech
// level above that device's own noise floor (SNR), since automatic gain makes raw levels meaningless, and times are
// the gateway's own clock (when a turn began and ended there), never a device's.
import { norm } from './guide';

/** One utterance as the gateway saw it. `own`: already judged to be its speaker's own words. */
export type HeardTurn = { id: string; memberId: string; text: string; snrDb: number; start: number; end: number; own?: boolean };
export type Verdict = { own: boolean; reason: 'own' | 'duplicate' | 'crosstalk'; duplicateOf?: string };

export const CROSSTALK = {
  /** How much of the shorter text must appear in the longer for "the same words". */
  same: 0.55,
  /** Words this far apart in time are never the same utterance. */
  nearMs: 1500,
  /** One or two words ("yes", "oh look") only count as the same when one mic heard them clearly louder. */
  shortGapDb: 6,
  /** Different text (a garbled far copy): mostly overlapping in time, this much quieter, and well below the
   *  speaker's own usual level. */
  overlap: 0.6,
  farGapDb: 10,
  belowOwnDb: 8,
};

const words = (s: string) => norm(s).split(' ').filter(Boolean);
function trigrams(s: string): string[] {
  const t = norm(s).replace(/\s+/g, '');
  if (t.length <= 3) return t ? [t] : [];
  const out: string[] = [];
  for (let i = 0; i + 3 <= t.length; i++) out.push(t.slice(i, i + 3));
  return out;
}
function containment(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const pool = new Map<string, number>();
  for (const w of long) pool.set(w, (pool.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of short) { const n = pool.get(w) ?? 0; if (n) { hit++; pool.set(w, n - 1); } }
  return hit / short.length;
}

/** How much of the shorter text is in the longer (0..1): by words, or by letter triples for text without spaces
 *  (Chinese, Japanese, Thai), where a whole sentence is one "word". */
export function similarity(a: string, b: string): number {
  const wa = words(a), wb = words(b);
  if (!wa.length || !wb.length) return 0;
  return wa.length > 1 && wb.length > 1 ? containment(wa, wb) : containment(trigrams(a), trigrams(b));
}

const gapMs = (a: HeardTurn, b: HeardTurn) => Math.max(a.start, b.start) - Math.min(a.end, b.end); // < 0: overlapping
const overlap = (a: HeardTurn, b: HeardTurn) => Math.max(0, -gapMs(a, b)) / Math.max(1, Math.min(a.end - a.start, b.end - b.start));

/**
 * Whose words were these? `recent`: what the other devices in the room heard lately. `ownLevel`: each member's usual
 * SNR for their own voice (learned from their kept words), if known.
 */
export function judge(entry: HeardTurn, recent: readonly HeardTurn[], ownLevel: Readonly<Record<string, number>> = {}): Verdict {
  for (const o of recent) {
    if (o.memberId === entry.memberId || o.id === entry.id || gapMs(entry, o) > CROSSTALK.nearMs) continue;
    const louder = o.snrDb - entry.snrDb; // > 0: the other mic heard it louder
    if (similarity(entry.text, o.text) >= CROSSTALK.same) {
      const short = Math.min(words(entry.text).length, words(o.text).length) <= 2;
      if (short && Math.abs(louder) < CROSSTALK.shortGapDb) continue; // two people both said "yes"
      // Already kept stays kept (it may have been answered); otherwise the louder mic has it.
      if (o.own || louder > 0) return { own: false, reason: 'duplicate', duplicateOf: o.id };
      continue;
    }
    const usual = ownLevel[entry.memberId];
    if (overlap(entry, o) >= CROSSTALK.overlap && louder >= CROSSTALK.farGapDb && (usual === undefined || entry.snrDb <= usual - CROSSTALK.belowOwnDb)) {
      return { own: false, reason: 'crosstalk', duplicateOf: o.id };
    }
  }
  return { own: true, reason: 'own' };
}
