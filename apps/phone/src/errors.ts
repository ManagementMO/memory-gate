// Server errors arrive as ConvexError { code, message }. Turn them into plain words with a next step.
export type Problem = { code: string; message: string };

const PLAIN: Record<string, string> = {
  ROOM_NOT_FOUND: "We couldn't find a room with that code. Check the six letters and numbers, then try again.",
  NOT_A_MEMBER: "This phone isn't part of that room any more. Join again with the room code.",
  NO_CONSENT: "That needs a permission nobody has given yet. Open Permissions to turn it on.",
  NO_SCOPES: 'Pick at least one permission, then continue.',
  STALE: 'The room changed. Take another look, then try again.',
  NOTHING_TO_UNDO: "There's nothing to undo yet.",
  BAD_LABEL: "Use plain words for the object's name, like “piano” or “radio”.",
  EMPTY: 'Type a few words first.',
  CONFIRM: 'Type the room code exactly as shown to confirm.',
  NOT_READY: "That room isn't ready yet. Give it a moment.",
  NOT_FOUND: "That isn't in this room any more. It may have just changed.",
  BAD_FLAG: "That setting doesn't exist.",
};

export function problemOf(e: unknown): Problem {
  const data = (e as { data?: unknown } | null)?.data;
  if (data && typeof data === 'object' && 'code' in data) {
    const d = data as { code?: unknown; message?: unknown };
    const code = typeof d.code === 'string' ? d.code : 'ERROR';
    if (code === 'FORBIDDEN') {
      const why = typeof d.message === 'string' ? d.message : 'Only some people in the room can do that.';
      return { code, message: `${why} Ask the person who made the room.` };
    }
    return { code, message: PLAIN[code] ?? (typeof d.message === 'string' ? d.message : 'Something went wrong. Try again.') };
  }
  const text = e instanceof Error ? e.message : String(e);
  for (const code of Object.keys(PLAIN)) if (text.includes(code)) return { code, message: PLAIN[code]! };
  if (/fetch|network|Failed to fetch|upload/i.test(text)) {
    return { code: 'NETWORK', message: "We couldn't reach the room. Check that this phone is on the same Wi-Fi, then try again." };
  }
  return { code: 'ERROR', message: 'Something went wrong. Try again, or reload the page.' };
}
