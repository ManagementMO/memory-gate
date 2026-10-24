// The team's memory exchange (SpacetimeDB, reached through its gateway at /exchange): memories family passed to this
// person in their own words, and historical photos pinned to the family's shared board. The gateway checks the
// session's membership and consent on every message. When the exchange isn't running, this stays quietly
// unavailable and the album simply doesn't show those rows.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '../state/store';

export type ArchiveReference = {
  id: string; sourceUrl: string; title: string; publisher: string; date: string; description: string; rights: string;
  imageUrl: string | null; uncertainty: string; retrievedAt: string; provenance: string; contributor?: string;
};
export type Capsule = {
  id: string; title: string; sourceId: string; senderId: string; recipientId: string; senderName: string; recipientName: string;
  status: string; revision: number; sourceAvailable: boolean; createdAt: number;
};
export type OpenedMemory = {
  capsuleId: string;
  source: { transcript: string; translation: string | null; language: string | null; speaker: string; source: string; audioUrl: string | null };
};
type Snapshot = {
  context: { memberId: string; paused: boolean; recordingAllowed: boolean; members: { id: string; name: string; role: string }[] };
  capsules: Capsule[]; references: ArchiveReference[]; online: string[];
};

const MAX_TRIES = 4; // a missing gateway is tried a few times, gently, then left alone

export function useExchange(session: Session | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [opened, setOpened] = useState<OpenedMemory | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'unavailable'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const pending = useRef(new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: number }>());

  const request = useCallback((message: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) { reject(new Error('The exchange is reconnecting.')); return; }
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => { pending.current.delete(requestId); reject(new Error('No reply from the exchange.')); }, 15_000);
    pending.current.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ ...message, requestId }));
  }), []);

  useEffect(() => {
    if (!session) { setStatus('unavailable'); return; }
    let disposed = false, timer = 0, tries = 0;
    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/exchange`);
      socketRef.current = socket;
      socket.onopen = () => { void request({ type: 'join', code: session.code, token: session.token }).catch(() => undefined); };
      socket.onmessage = (event) => {
        if (disposed) return;
        let data: Record<string, unknown> & { type?: string; requestId?: string; message?: string };
        try { data = JSON.parse(String(event.data)); } catch { return; }
        if (data.type === 'snapshot') { tries = 0; setSnapshot(data as unknown as Snapshot); setStatus('connected'); }
        if (data.type === 'opened') setOpened(data as unknown as OpenedMemory);
        if (data.type === 'unavailable') { setSnapshot(null); setStatus('unavailable'); }
        if (data.type === 'ack' || data.type === 'error') {
          const p = pending.current.get(data.requestId ?? '');
          if (p) { window.clearTimeout(p.timer); pending.current.delete(data.requestId ?? ''); if (data.type === 'ack') p.resolve(); else p.reject(new Error(data.message ?? 'Not saved.')); }
        }
      };
      socket.onclose = () => {
        if (disposed) return;
        setStatus('unavailable'); setSnapshot(null);
        for (const p of pending.current.values()) { window.clearTimeout(p.timer); p.reject(new Error('Connection interrupted.')); }
        pending.current.clear();
        if (++tries < MAX_TRIES) timer = window.setTimeout(connect, 1500 * 2 ** tries);
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { disposed = true; window.clearTimeout(timer); socketRef.current?.close(); socketRef.current = null; };
  }, [session?.code, session?.token, request]);

  return { snapshot, opened, status, request, close: () => setOpened(null) };
}
