// Old photographs of the place and time, from the Library of Congress (the team's Apify Actor, through the exchange).
// A search can take a couple of minutes and the gateway saves one action per connection at a time, so the search and
// its pin get their own short-lived connection; the visit's own connection stays free for being together.
import type { Session } from '../state/store';
import type { ArchiveReference } from './store';

export type ArchiveResult = { references: ArchiveReference[]; warnings: string[]; statement?: string; execution?: string };

let socket: WebSocket | null = null;
let ready: Promise<void> | null = null;
let idle = 0;
let seq = 0;
const pending = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
let results: ((r: ArchiveResult) => void) | null = null;

function connect(session: Session): Promise<void> {
  if (socket && ready && socket.readyState <= WebSocket.OPEN) return ready;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/exchange`);
  socket = ws;
  ready = new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => { reject(new Error('The archive isn’t reachable right now.')); ws.close(); }, 6000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', code: session.code, token: session.token, requestId: `a${++seq}` }));
    ws.onmessage = (ev) => {
      let d: { type?: string; requestId?: string; message?: string; result?: ArchiveResult };
      try { d = JSON.parse(String(ev.data)); } catch { return; }
      if (d.type === 'snapshot') { window.clearTimeout(t); resolve(); }
      if (d.type === 'unavailable') { window.clearTimeout(t); reject(new Error(d.message ?? 'The archive isn’t available here.')); }
      if (d.type === 'search-results' && d.result) results?.(d.result);
      if ((d.type === 'ack' || d.type === 'error') && d.requestId) {
        const p = pending.get(d.requestId); pending.delete(d.requestId);
        if (d.type === 'ack') p?.resolve(); else p?.reject(new Error(d.message ?? 'That didn’t work.'));
      }
    };
    ws.onclose = () => { window.clearTimeout(t); for (const p of pending.values()) p.reject(new Error('The archive connection closed.')); pending.clear(); if (socket === ws) { socket = null; ready = null; } };
  });
  return ready;
}

function request(m: Record<string, unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) { reject(new Error('The archive isn’t reachable right now.')); return; }
    const requestId = `a${++seq}`;
    const t = window.setTimeout(() => { pending.delete(requestId); reject(new Error('The archive took too long. Try again in a moment.')); }, timeoutMs);
    pending.set(requestId, { resolve: () => { window.clearTimeout(t); resolve(); }, reject: (e) => { window.clearTimeout(t); reject(e); } });
    socket.send(JSON.stringify({ ...m, requestId }));
  });
}

/** Closes the archive connection after five quiet minutes. */
function keepAlive() { window.clearTimeout(idle); idle = window.setTimeout(() => socket?.close(), 300_000); }

export async function searchArchive(session: Session, input: { place: string; yearFrom: number; yearTo: number; terms: string }): Promise<ArchiveResult> {
  await connect(session);
  keepAlive();
  let got: ArchiveResult | null = null;
  results = (r) => { got = r; };
  await request({ type: 'search', input: { ...input, maxItems: 4 } }, 180_000);
  results = null;
  if (!got) throw new Error('The archive returned nothing this time.');
  return got;
}

export async function pinArchive(session: Session, referenceId: string, perspectiveId: string, placement: Record<string, number | null | string>): Promise<void> {
  await connect(session);
  keepAlive();
  await request({ type: 'pin-perspective', referenceId, perspectiveId, placement }, 20_000);
}
