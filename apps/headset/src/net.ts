// Backend access for the headset: one ConvexClient on this page's own origin (the dev server proxies /api to the
// local Convex backend, so the Quest needs no second host, no mixed content and no CORS), storage URL rewriting,
// the join/token flow, and plain-language error messages.
import { ConvexClient } from 'convex/browser';
import { ConvexError } from 'convex/values';
import { api } from '../../../convex/_generated/api.js';

export { api };
export type Api = typeof api;

declare const __MG_BACKEND_ORIGIN__: string;
const BACKEND_ORIGIN = typeof __MG_BACKEND_ORIGIN__ === 'string' ? __MG_BACKEND_ORIGIN__ : 'http://127.0.0.1:3210';

/** `?convex=<url>` (desktop debugging) wins; otherwise the page's own origin, served through the dev-server proxy. */
export function convexAddress(): string {
  const override = import.meta.env.DEV ? new URLSearchParams(location.search).get('convex') : null;
  if (override && /^https?:\/\//.test(override)) return override.replace(/\/+$/, '');
  return window.location.origin;
}

export function makeClient(): ConvexClient {
  return new ConvexClient(convexAddress(), { skipConvexDeploymentUrlCheck: true, unsavedChangesWarning: false });
}

/** Storage URLs come back absolute on the backend's origin (http://127.0.0.1:3210/api/storage/…). Load them through
 * whatever origin the client talks to, so the Quest fetches splats, GLBs and audio over this page's HTTPS. */
export function fileUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    const target = new URL(convexAddress());
    const backend = new URL(BACKEND_ORIGIN);
    const local = (h: string) => h === '127.0.0.1' || h === 'localhost' || h === '0.0.0.0';
    const sameBackend = url.origin === backend.origin || (local(url.hostname) && local(backend.hostname) && url.port === backend.port);
    if (sameBackend && url.origin !== target.origin) return `${target.origin}${url.pathname}${url.search}`;
    return url.toString();
  } catch {
    return u;
  }
}

export type JoinRole = 'storyteller' | 'viewer';
/** The headset's token lives at mg.token.<CODE>; a read-only spectator's at mg.token.<CODE>.viewer. */
export const tokenKey = (code: string, role: JoinRole = 'storyteller') => (role === 'viewer' ? `mg.token.${code}.viewer` : `mg.token.${code}`);

function readToken(code: string, role: JoinRole): string | null {
  try { return localStorage.getItem(tokenKey(code, role)); } catch { return null; }
}
function writeToken(code: string, token: string | null, role: JoinRole): void {
  try {
    if (token) localStorage.setItem(tokenKey(code, role), token);
    else localStorage.removeItem(tokenKey(code, role));
  } catch { /* private mode: the token lives only in memory for this visit */ }
}

/** The room code from `?room=` (6 characters from the join alphabet), or null. */
export function roomCodeFromUrl(): string | null {
  const raw = new URLSearchParams(location.search).get('room');
  const code = normalizeCode(raw ?? '');
  return code.length === 6 ? code : null;
}
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export type Session = { code: string; token: string };

/** Join as the storyteller's headset (or a read-only spectator), reusing a stored token the backend still accepts. */
export async function joinRoom(client: ConvexClient, code: string, role: JoinRole = 'storyteller'): Promise<Session> {
  const stored = readToken(code, role);
  if (stored) {
    try {
      await client.query(api.rooms.get, { code, token: stored });
      return { code, token: stored };
    } catch (e) {
      if (errorCode(e) === 'ROOM_NOT_FOUND') throw e;
      writeToken(code, null, role); // revoked or from another deployment: join again
    }
  }
  if (role === 'viewer') {
    const r = await client.mutation(api.rooms.join, { code, displayName: 'Spectator', role: 'viewer' });
    writeToken(r.code, r.token, role);
    return { code: r.code, token: r.token };
  }
  // The storyteller's self-chosen name for captions ("Grandma · 7:42 PM") can come from ?name=; default "Headset".
  const name = (new URLSearchParams(location.search).get('name') ?? '').trim().slice(0, 40) || 'Headset';
  // The family key from the headset link (?key=) is what lets this device join as the storyteller; the code alone
  // only allows watching (open the link the family's phone shows, not just the code).
  const key = (new URLSearchParams(location.search).get('key') ?? '').trim();
  const r = await client.mutation(api.rooms.join, { code, displayName: name, role: 'storyteller', ...(key ? { key } : {}) });
  writeToken(r.code, r.token, role);
  return { code: r.code, token: r.token };
}

export function errorCode(e: unknown): string | null {
  if (e instanceof ConvexError) {
    const d = e.data as { code?: string } | string;
    return typeof d === 'object' && d && typeof d.code === 'string' ? d.code : null;
  }
  const m = String((e as Error)?.message ?? e);
  const hit = m.match(/"code":"([A-Z_]+)"/) ?? m.match(/\b(ROOM_NOT_FOUND|NOT_A_MEMBER|NO_CONSENT|FORBIDDEN|STALE|NOTHING_TO_UNDO|EMPTY)\b/);
  return hit?.[1] ?? null;
}

/** Plain-language messages for people, never stack traces or vendor names. */
export function humanError(e: unknown): string {
  const code = errorCode(e);
  const known: Record<string, string> = {
    ROOM_NOT_FOUND: 'There is no room with that code. Check the 6-character code on the family’s phone.',
    NOT_A_MEMBER: 'This headset is no longer part of the room. Reload to join again.',
    NO_CONSENT: 'Voice needs permission first. On the phone, turn on “voice” in the room’s permissions.',
    FORBIDDEN: 'This headset isn’t allowed to do that.',
    EMPTY: 'Nothing was heard. Try again, a little closer to the microphone.',
    NOTHING_TO_UNDO: 'There is nothing to undo.',
    NEED_KEY: 'Open the headset link from the family’s phone. It carries the family key; the room code alone can only watch.',
    PAUSED: 'The memory is resting. Resume it on the phone first.',
  };
  if (code && known[code]) return known[code];
  if (e instanceof ConvexError) {
    const d = e.data as { message?: string } | string;
    const msg = typeof d === 'string' ? d : d?.message;
    if (msg) return msg;
  }
  const m = String((e as Error)?.message ?? e);
  if (/fetch|network|websocket|Failed to|ECONN|timed out/i.test(m)) return 'Can’t reach the memory server. Check the Wi-Fi and that the laptop is running.';
  return 'Something went wrong. Please try again.';
}

export const newCommandId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
