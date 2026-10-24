// Presence over SpacetimeDB: the team's exchange gateway (/exchange) checks this device's room session in Convex, then
// keeps "who is here" (each person's light, seat and colour, and their latest look-here mark) in SpacetimeDB and
// pushes every change to the room's devices. Used whenever the exchange is running; PresenceSync falls back to the
// Convex presence otherwise, so being together never depends on it.
import type { Session } from '../state/store';
import type { Person } from './presence';
import { socialLink } from '../social/link';
import type { Member } from '../social/store';

type Row = { memberId: string; roomId: string; host: boolean; seat: number; color: string; device: string; pointX: number; pointY: number; pointZ: number; pointAt: number; updatedAt: number; leftAt: number };
export type PresenceUpdate = { others: Person[]; me: { seat: number; color: string } | null; offset: number };

const FRESH_MS = 9000;

function toUpdate(rows: Row[], now: number, memberId: string): PresenceUpdate {
  const offset = now - Date.now();
  const mine = rows.find((r) => r.memberId === memberId);
  const others: Person[] = rows
    .filter((r) => r.memberId !== memberId && r.leftAt === 0 && now - r.updatedAt < FRESH_MS)
    .sort((a, b) => a.seat - b.seat)
    .map((r) => ({ id: r.memberId, host: r.host, seat: r.seat, color: r.color, device: r.device as Person['device'], point: r.pointAt > 0 ? { at: [r.pointX, r.pointY, r.pointZ], t: r.pointAt } : null }));
  return { others, me: mine ? { seat: mine.seat, color: mine.color } : null, offset };
}

export type SpacetimePresence = { here: (device: Person['device']) => void; point: (at: number[]) => void; leave: () => void; close: () => void };

/** Connects and joins; resolves once the first snapshot arrives (null if the exchange isn't there within ~3.5 s). */
export function connectSpacetimePresence(session: Session, onUpdate: (u: PresenceUpdate) => void, onLost: () => void): Promise<SpacetimePresence | null> {
  return new Promise((resolve) => {
    let settled = false, memberId = '', seq = 0;
    // Perspectives share this socket (social/link.ts): actions wait for the gateway's ack or error, poses don't.
    const pending = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: number }>();
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/exchange`);
    const give = (v: SpacetimePresence | null) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => { give(null); socket.close(); }, 3500);
    const sendMsg = (m: Record<string, unknown>) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ...m, requestId: `p${++seq}` })); };
    const request = (m: Record<string, unknown>, timeoutMs = 20_000) => new Promise<void>((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) { reject(new Error('The exchange is reconnecting.')); return; }
      const requestId = `s${++seq}`;
      const timer = window.setTimeout(() => { pending.delete(requestId); reject(new Error('The exchange did not answer.')); }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ ...m, requestId }));
    });
    const post = (m: Record<string, unknown>) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m)); };
    const api: SpacetimePresence = {
      here: (device) => sendMsg({ type: 'here', device }),
      point: (at) => sendMsg({ type: 'point', at }),
      leave: () => sendMsg({ type: 'leave' }),
      close: () => { clearTimeout(timer); socket.onclose = null; socket.close(); socialLink.detach(); },
    };
    socket.onopen = () => sendMsg({ type: 'join', code: session.code, token: session.token });
    socket.onmessage = (event) => {
      let d: { type?: string; context?: { memberId: string; roomId: string; members?: Member[] }; presence?: Row[]; now?: number; requestId?: string; message?: string };
      try { d = JSON.parse(String(event.data)); } catch { return; }
      if (d.type === 'snapshot' && d.context) {
        if (!memberId) socialLink.attach({ request, post }, d.context.memberId, d.context.members ?? [], d.context.roomId);
        else socialLink.members(d.context.members ?? []);
        memberId = d.context.memberId; clearTimeout(timer); give(api);
      }
      if ((d.type === 'ack' || d.type === 'error') && d.requestId && pending.has(d.requestId)) {
        const p = pending.get(d.requestId)!; pending.delete(d.requestId); window.clearTimeout(p.timer);
        if (d.type === 'ack') p.resolve(); else p.reject(new Error(d.message ?? 'That could not be saved.'));
      }
      socialLink.receive(d as Parameters<typeof socialLink.receive>[0]);
      if ((d.type === 'snapshot' || d.type === 'presence') && memberId && d.presence) onUpdate(toUpdate(d.presence, d.now ?? Date.now(), memberId));
      if (d.type === 'unavailable' && !settled) { clearTimeout(timer); give(null); socket.close(); }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      clearTimeout(timer);
      for (const p of pending.values()) { window.clearTimeout(p.timer); p.reject(new Error('The exchange went away.')); }
      pending.clear(); socialLink.detach();
      if (!settled) give(null); else onLost();
    };
  });
}

/** A visit happening nearby, from the gateway (null when none, or when the exchange isn't running). */
export async function spacetimeNearby(): Promise<{ code: string; key: string } | null | undefined> {
  try {
    const r = await fetch('/exchange/nearby', { cache: 'no-store' });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { nearby?: { code: string; key: string } | null };
    return j.nearby ?? null;
  } catch { return undefined; }
}
