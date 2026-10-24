// Keeps this device present in the visit: says "I'm here" every two seconds (and at once with a "look here" tap),
// keeps the list of the others who are here, and, before Begin, notices a visit already happening nearby.
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { api } from '../../../../convex/_generated/api';
import { useGate } from '../state/store';
import { deviceKind, pointBus, serverNow, usePresence, type Person } from './presence';

const FRESH_MS = 9000;
const OFFLINE = new URLSearchParams(location.search).get('mode') === 'offline';

export function PresenceSync() {
  const session = useGate((s) => s.session);
  const xr = useGate((s) => s.xr);
  const stage = useGate((s) => s.stage);
  const invite = useGate((s) => s.invite);
  const here = useMutation(api.presence.here);
  const leave = useMutation(api.presence.leave);
  const set = usePresence((s) => s.set);

  // Heartbeat, and marks sent the moment they're made.
  useEffect(() => {
    if (!session) return;
    let live = true;
    // A heartbeat that misses is simply sent again two seconds later; a "look here" mark retries at once (a busy
    // local backend can drop a write).
    const send = (point?: number[], tries = 3) => {
      const t0 = Date.now();
      here({ code: session.code, token: session.token, device: deviceKind(xr), ...(point ? { point } : {}) })
        .then((r) => { if (live) set({ me: { seat: r.seat, color: r.color }, offset: r.now - (t0 + (Date.now() - t0) / 2) }); })
        .catch(() => { if (live && point && tries > 1) setTimeout(() => send(point, tries - 1), 500); });
    };
    send();
    const timer = setInterval(() => send(), 2000);
    pointBus.send = (at) => { set({ myPoint: { at, t: serverNow() } }); send(at); };
    const bye = () => { void leave({ code: session.code, token: session.token }).catch(() => undefined); };
    addEventListener('pagehide', bye);
    return () => { live = false; clearInterval(timer); pointBus.send = null; removeEventListener('pagehide', bye); };
  }, [session, xr, here, leave, set]);

  // The others who are here now (a light goes out a few seconds after its page stops answering).
  const rows = useQuery(api.presence.list, session ? { code: session.code, token: session.token } : 'skip');
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 3000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!rows) { set({ others: [] }); return; }
    const now = serverNow();
    const others: Person[] = rows
      .filter((r) => !r.me && r.leftAt === null && now - r.updatedAt < FRESH_MS)
      .map((r) => ({ id: r.id, host: r.host, seat: r.seat, color: r.color, device: r.device as Person['device'], point: r.point }));
    set({ others });
  }, [rows, tick, set]);

  // Before Begin: a visit already happening nearby, offered in one tap. Never in test (offline) runs.
  const lookNearby = !session && stage === 'portal' && !invite && !OFFLINE;
  const after = Math.floor((serverNow() - 20000) / 5000) * 5000;
  const nearby = useQuery(api.presence.nearby, lookNearby ? { after } : 'skip');
  useEffect(() => { set({ nearby: lookNearby && nearby ? { code: nearby.code, key: nearby.key } : null }); }, [nearby, lookNearby, set]);
  return null;
}
