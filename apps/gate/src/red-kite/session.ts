import { api } from '../../../../convex/_generated/api';
import { convex } from '../backend/client';

export type KiteSession = { code: string; token: string; role: 'family' | 'viewer' };
const key = 'mg.red-kite.session.';
let pending: Promise<KiteSession> | null = null;

/** One bootstrap per page, including StrictMode. Tokens stay in browser storage and never in spectator links. */
export function openKiteSession(): Promise<KiteSession> {
  pending ??= bootstrap().catch(e => { pending = null; throw e; });
  return pending;
}
async function bootstrap(): Promise<KiteSession> {
  const params = new URLSearchParams(location.search);
  const code = (params.get('room') ?? '').toUpperCase();
  if (code && !/^[A-Z0-9]{6}$/.test(code)) throw new Error('This story link has an invalid room code.');
  const liveSources = params.get('sources') === 'live';
  const slot = key + (code || (liveSources ? 'owner-live' : 'owner'));
  let saved: KiteSession | null = null;
  try { saved = JSON.parse(localStorage.getItem(slot) ?? 'null'); } catch { /* first visit */ }
  if (saved) {
    try {
      const view = await convex.query(api.rooms.get, { code: saved.code, token: saved.token });
      if (!view.room.demo) throw new Error('Not a sample room.');
      await finishSetup(saved);
      return saved;
    } catch (e) {
      // A live transport failure must not silently create a second room or discard a valid session.
      const message = String(e);
      if (!/NOT_A_MEMBER|ROOM_NOT_FOUND|Not a sample room/.test(message)) throw e;
      localStorage.removeItem(slot);
    }
  }
  let session: KiteSession;
  if (code) {
    const familyKey = params.get('key');
    const role = familyKey ? 'family' : 'viewer';
    const auth = await convex.mutation(api.rooms.join, { code, role, displayName: 'Story visitor', ...(familyKey ? { key: familyKey } : {}) });
    session = { ...auth, role };
  } else {
    const auth = await convex.mutation(api.rooms.create, { title: 'The Red Kite · two tellings', displayName: 'Sample storyteller', demo: true, offline: !liveSources });
    session = { ...auth, role: 'family' };
    // Persist before the remaining setup so a slow response can be recovered without another room.
    localStorage.setItem(slot, JSON.stringify(session));
  }
  localStorage.setItem(slot, JSON.stringify(session));
  await finishSetup(session);
  return session;
}

async function finishSetup(session: KiteSession) {
  if (session.role !== 'family') return;
  const auth = { code: session.code, token: session.token };
  // A prepared, paused story is a valid destination. Reopening it must not unpause or write.
  const current = await convex.query(api.redKite.current, auth);
  if (current) return;
  const view = await convex.query(api.rooms.get, auth);
  if (view.room.paused) throw new Error('This sample is resting before setup. Its host can resume it.');
  if (view.me.isOwner) {
    if (!view.consents.some(c => c.scopes.includes('share_with_family'))) await convex.mutation(api.consents.give, { ...auth, scopes: ['share_with_family'] });
    // Only an unfinished owner bootstrap selects the cached world; a later reopen preserves the room.
    await convex.mutation(api.splats.usePracticeWorld, { ...auth, setting: 'red-kite' });
  }
  await convex.mutation(api.redKite.prepare, auth);
}
