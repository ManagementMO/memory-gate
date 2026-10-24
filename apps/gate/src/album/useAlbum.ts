// The album's memories: everything kept on this device in this visit (instant, never waits on a network), plus
// moments saved in earlier sessions on this device, fetched quietly from the backend. Offline or empty: just local.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../../convex/_generated/api';
import { convex, fileUrl, savedSessions } from '../backend/client';
import { useMoments } from '../flow/moments';
import { useGate } from '../state/store';
import type { AlbumMemory, AlbumMoment } from './types';

type Remote = { id: string; memoryTitle: string; caption: string; speaker: string; kind: string; at: number; imageUrl: string | null; audioUrl: string | null };

const timeout = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

/** Group a session's saved moments into memories (one per title, in the order they happened). */
export function groupRemote(code: string, rows: Remote[]): AlbumMemory[] {
  const byTitle = new Map<string, AlbumMoment[]>();
  for (const r of [...rows].sort((a, b) => a.at - b.at)) {
    const title = r.memoryTitle || 'A remembered place';
    const list = byTitle.get(title) ?? [];
    list.push({
      id: `remote-${r.id}`, memoryId: `${code}:${title}`, memoryTitle: title, caption: r.caption,
      speaker: r.speaker === 'companion' ? 'companion' : 'you', at: r.at,
      imageUrl: fileUrl(r.imageUrl), sourceUrl: null, audioUrl: fileUrl(r.audioUrl),
      kind: r.kind === 'arrival' || r.kind === 'final' ? r.kind : 'detail',
    });
    byTitle.set(title, list);
  }
  return [...byTitle.entries()].map(([title, moments]) => ({
    id: `${code}:${title}`, title, at: moments[0]?.at ?? 0, source: 'words' as const, palette: [], moments,
  }));
}

export function useAlbum(): AlbumMemory[] {
  const local = useMoments((s) => s.memories);
  const [remote, setRemote] = useState<AlbumMemory[]>([]);
  useEffect(() => {
    let alive = true;
    const current = useGate.getState().session?.code;
    const others = savedSessions().filter((s) => s.code !== current).slice(0, 8);
    if (!others.length) return;
    void (async () => {
      const settled = await Promise.allSettled(others.map(async (s) => groupRemote(s.code, (await timeout(convex.query(api.moments.list, { code: s.code, token: s.token }), 5000)) as Remote[])));
      if (!alive) return;
      const list = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((m) => m.moments.length > 0);
      setRemote(list.sort((a, b) => b.at - a.at));
    })().catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return useMemo(() => [...local.filter((m) => m.moments.length > 0), ...remote], [local, remote]);
}
