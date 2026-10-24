// Keeps this device present in the visit. Whenever the team's exchange is running, presence lives in SpacetimeDB
// (through its gateway, which checks the room session in Convex): a heartbeat every three seconds, look-here marks the
// moment they're made, and every change pushed to the room's devices. Otherwise it falls back to Convex presence,
// so being together never depends on the exchange. Before Begin it notices a visit already happening nearby.
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { api } from '../../../../convex/_generated/api';
import { useGate } from '../state/store';
import { deviceKind, pointBus, serverNow, usePresence, type Person } from './presence';
import { connectSpacetimePresence, spacetimeNearby } from './spacetime';

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
  const backend = usePresence((s) => s.backend);

  // Which store holds presence for this session: SpacetimeDB when the exchange answers, else Convex.
  useEffect(() => {
    if (!session) { set({ backend: null, others: [], me: null }); return; }
    let live = true, closeLink: (() => void) | null = null, beat = 0;
    const device = () => deviceKind(useGate.getState().xr);
    void connectSpacetimePresence(session, (u) => { if (live) set({ others: u.others, me: u.me, offset: u.offset }); }, () => {
      // The exchange went away mid-visit: carry on with Convex presence.
      if (live) { window.clearInterval(beat); pointBus.send = null; set({ backend: 'convex' }); }
    }).then((link) => {
      if (!live) { link?.close(); return; }
      if (!link) { set({ backend: 'convex' }); return; }
      closeLink = () => { link.leave(); link.close(); };
      set({ backend: 'spacetime' });
      link.here(device());
      beat = window.setInterval(() => link.here(device()), 3000);
      pointBus.send = (at) => { set({ myPoint: { at, t: serverNow() } }); link.point(at); };
      addEventListener('pagehide', closeLink);
    });
    return () => { live = false; window.clearInterval(beat); if (closeLink) { removeEventListener('pagehide', closeLink); closeLink(); } };
  }, [session, set]);

  // Convex presence (fallback): heartbeat, and marks sent the moment they're made.
  useEffect(() => {
    if (!session || backend !== 'convex') return;
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
  }, [session, xr, here, leave, set, backend]);

  // The others who are here now, from Convex (fallback only; SpacetimeDB pushes them itself).
  const rows = useQuery(api.presence.list, session && backend === 'convex' ? { code: session.code, token: session.token } : 'skip');
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 3000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (backend !== 'convex') return;
    if (!rows) { set({ others: [] }); return; }
    const now = serverNow();
    const others: Person[] = rows
      .filter((r) => !r.me && r.leftAt === null && now - r.updatedAt < FRESH_MS)
      .map((r) => ({ id: r.id, host: r.host, seat: r.seat, color: r.color, device: r.device as Person['device'], point: r.point }));
    set({ others });
  }, [rows, tick, set, backend]);

  // Before Begin: a visit already happening nearby, offered in one tap (SpacetimeDB first, then Convex). Never in
  // test (offline) runs.
  const lookNearby = !session && stage === 'portal' && !invite && !OFFLINE;
  const [stNearby, setStNearby] = useState<{ code: string; key: string } | null | undefined>(undefined);
  useEffect(() => {
    if (!lookNearby) return;
    // Every 4 s while the exchange answers; when it doesn't, back off to every 30 s (Convex covers it meanwhile).
    let live = true, t = 0;
    const poll = () => { void spacetimeNearby().then((v) => { if (!live) return; setStNearby(v); t = window.setTimeout(poll, v === undefined ? 30_000 : 4000); }); };
    poll();
    return () => { live = false; window.clearTimeout(t); };
  }, [lookNearby]);
  const after = Math.floor((serverNow() - 20000) / 5000) * 5000;
  const convexNearby = useQuery(api.presence.nearby, lookNearby && stNearby === undefined ? { after } : 'skip');
  useEffect(() => {
    const value = !lookNearby ? null : stNearby !== undefined ? stNearby : convexNearby ? { code: convexNearby.code, key: convexNearby.key } : null;
    set({ nearby: value });
  }, [stNearby, convexNearby, lookNearby, set]);
  void tick;
  return null;
}
