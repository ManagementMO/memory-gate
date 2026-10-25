// When the companion speaks in a conversation with two people who are also talking to each other: not over them, not
// after every sentence, but once there's a short lull, answering everything just said. A question put to it directly
// is answered at the next lull even if it spoke a moment ago.

export type LullState = {
  /** Turns someone is in the middle of speaking (heard starting, not yet finished). */
  open: number;
  /** When the last kept words ended (gateway clock, ms). */
  lastHeardAt: number;
  /** When the companion last spoke. */
  lastSpokeAt: number;
  /** Kept person turns since the companion last spoke. */
  pending: number;
  /** One of them was put to the companion directly. */
  addressed: boolean;
};

export const LULL = { quietMs: 1500, spacingMs: 4000 };

export function shouldSpeak(s: LullState, now: number): boolean {
  if (s.open > 0 || s.pending === 0) return false;
  if (now - s.lastHeardAt < LULL.quietMs) return false;
  return s.addressed || now - s.lastSpokeAt >= LULL.spacingMs;
}

/** How long until it may be time to speak (ms), or null while there's nothing to answer or someone is talking. */
export function untilLull(s: LullState, now: number): number | null {
  if (s.open > 0 || s.pending === 0) return null;
  const quiet = s.lastHeardAt + LULL.quietMs - now;
  const spaced = s.addressed ? 0 : s.lastSpokeAt + LULL.spacingMs - now;
  return Math.max(0, quiet, spaced);
}

/** Words put to the companion directly: a question to "you", a request, or a question mark at the end. */
export function addressesCompanion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /\?\s*$/.test(t)
    || /^(can|could|would|will|do|did) you\b/.test(t)
    || /^(tell me|show me|what (do|did|should|can) (you|we)|where (do|should) we|hey|hello|hi)\b/.test(t)
    || /\b(companion|helper)\b/.test(t);
}
