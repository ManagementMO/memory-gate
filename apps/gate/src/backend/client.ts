// The Convex connection and this device's place in a session. Nobody types a code: Begin silently creates a
// session (a "room" in the backend) and records the consent that the portal's words describe; an invitation link
// carries the code and family key, so joining is one tap. If the backend can't be reached, the experience still
// runs on this device alone (browser voice, the offline companion and planner) and says so quietly.
import { ConvexReactClient } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Session } from '../state/store';

const override = new URLSearchParams(location.search).get('convex');
export const CONVEX_URL = override && /^https?:\/\//.test(override) ? override : location.origin;
export const convex = new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false });

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])$/i;

/** Storage URLs come back on the backend's own origin; route them through this page's origin (the dev proxy). */
export function fileUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    const base = new URL(CONVEX_URL);
    if (LOOPBACK.test(url.hostname) && url.origin !== base.origin && url.pathname.startsWith('/api/')) return `${base.origin}${url.pathname}${url.search}`;
    return url.toString();
  } catch { return null; }
}

const SESSIONS_KEY = 'mg.gate.sessions';
type Saved = Session & { createdAt: number; title?: string | null };

/** Every session this device has been part of (newest first): the album reads moments from all of them. */
export function savedSessions(): Saved[] {
  try { return (JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]') as Saved[]).filter((s) => s && s.code && s.token); } catch { return []; }
}
export function rememberSession(s: Session, title?: string | null): void {
  try {
    const all = savedSessions().filter((x) => x.code !== s.code);
    all.unshift({ ...s, createdAt: Date.now(), title: title ?? null });
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(all.slice(0, 40)));
  } catch { /* private mode: this session simply isn't remembered */ }
}

// What Begin agrees to (the portal says it in plain words): listening, keeping the voice with the memories,
// turning shared photos into 3D (on our GPU worker), and sharing with family who join.
const CONSENT_SCOPES = ['voice_processing', 'voice_recording', 'photo_processing', 'vendor_upload_modal', 'share_with_family'] as const;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** A busy local backend can drop a write (its per-function time limit); setup steps retry a few times, gently. */
async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await withTimeout(fn(), 6000); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
  }
  throw last;
}

/** Create (host) or join (guest) a session and record consent. Resolves null when the backend is unreachable. */
export async function startSession(opts: { name: string; invite: { code: string; key: string } | null }): Promise<Session | null> {
  try {
    if (opts.invite) {
      const r = await retry(() => convex.mutation(api.rooms.join, { code: opts.invite!.code, displayName: opts.name, role: 'family', key: opts.invite!.key }));
      const s: Session = { code: r.code, token: r.token, joinKey: opts.invite.key, role: 'guest', name: opts.name };
      rememberSession(s);
      return s;
    }
    // ?mode=offline creates an immutable offline room: the server forces every paid service off (tests, demos without keys).
    const offline = new URLSearchParams(location.search).get('mode') === 'offline';
    // ?memory=red-kite visits the team's cached fictional meadow (a labeled sample room); no world is generated.
    const meadow = new URLSearchParams(location.search).get('memory') === 'red-kite';
    const r = await retry(() => convex.mutation(api.rooms.create, { title: meadow ? 'The Red Kite meadow (fictional sample)' : 'A new memory', displayName: opts.name, demo: meadow, offline }));
    await retry(() => convex.mutation(api.consents.give, { code: r.code, token: r.token, scopes: [...CONSENT_SCOPES] }));
    if (meadow) await retry(() => convex.mutation(api.splats.usePracticeWorld, { code: r.code, token: r.token, setting: 'red-kite' })).catch((e) => console.warn('[gate] the meadow is not loaded (node scripts/red-kite-room.mjs)', e));
    const view = await retry(() => convex.query(api.rooms.get, { code: r.code, token: r.token }));
    const s: Session = { code: r.code, token: r.token, joinKey: view.joinKey ?? null, role: 'host', name: opts.name };
    rememberSession(s);
    return s;
  } catch (e) {
    console.warn('[gate] session unavailable; continuing on this device', e);
    return null;
  }
}

/** Upload a file to Convex storage through a session's upload URL. */
export async function uploadFile(uploadUrl: string, blob: Blob): Promise<string> {
  const target = fileUrl(uploadUrl) ?? uploadUrl;
  const r = await fetch(target, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  if (!r.ok) throw new Error(`upload failed (${r.status})`);
  const j = (await r.json()) as { storageId?: string };
  if (!j.storageId) throw new Error('upload returned no id');
  return j.storageId;
}

/** The invitation this page was opened with (?join=CODE&key=KEY&host=Name), if any. */
export function readInvite(): { code: string; key: string; host: string } | null {
  const p = new URLSearchParams(location.search);
  const code = (p.get('join') ?? '').trim().toUpperCase();
  const key = (p.get('key') ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code) || !/^[A-Z0-9]{6,12}$/.test(key)) return null;
  const host = (p.get('host') ?? '').trim().slice(0, 40) || 'your family';
  return { code, key, host };
}

export function inviteLink(s: Session, host: string): string {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('join', s.code);
  if (s.joinKey) u.searchParams.set('key', s.joinKey);
  u.searchParams.set('host', host);
  return u.toString();
}
