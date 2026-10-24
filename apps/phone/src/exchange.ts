import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from './session';

export type ArchiveReference = { id: string; sourceUrl: string; title: string; publisher: string; date: string; description: string; rights: string; imageUrl: string | null; dateMatch: string; uncertainty: string; retrievedAt: string; provenance: string; addedBy?: string; contributor?: string };
export type Capsule = { id: string; title: string; sourceId: string; senderId: string; recipientId: string; senderName: string; recipientName: string; status: string; revision: number; sourceAvailable: boolean; createdAt: number };
export type ExchangeSnapshot = {
  context: { memberId: string; paused: boolean; recordingAllowed: boolean; members: { id: string; name: string; role: string }[]; sources: { id: string; transcript: string; source: string; language: string | null }[] };
  capsules: Capsule[]; references: ArchiveReference[]; online: string[]; archiveMode: string;
};
export type OpenedMemory = { capsuleId: string; source: { transcript: string; translation: string | null; language: string | null; speaker: string; source: string; audioUrl: string | null; objects: { id: string; label: string; position: number[] }[] } };
export type ArchiveResult = { input: { place: string; yearFrom: number; yearTo: number; terms: string }; references: ArchiveReference[]; warnings: string[]; execution: string; runId: string; retrievedAt: string };

export function useExchange(session: Session) {
  const [snapshot, setSnapshot] = useState<ExchangeSnapshot | null>(null);
  const [opened, setOpened] = useState<OpenedMemory | null>(null);
  const [results, setResults] = useState<ArchiveResult | null>(null);
  const [problem, setProblem] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'unavailable'>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const pending = useRef(new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: number }>());
  const request = useCallback((message: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) { reject(new Error('The exchange is reconnecting. Please try again when connected.')); return; }
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => { pending.current.delete(requestId); reject(new Error('No confirmation arrived. Check the collection before trying again.')); }, message.type === 'search' ? 180_000 : 20_000);
    pending.current.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ ...message, requestId }));
  }), []);
  useEffect(() => {
    let disposed = false; let timer: number; let attempts = 0;
    const rejectPending = () => { for (const p of pending.current.values()) { window.clearTimeout(p.timer); p.reject(new Error('Connection interrupted. Reconnect to check whether the change was saved.')); } pending.current.clear(); };
    function connect() {
      if (disposed) return;
      setStatus('connecting');
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/exchange`);
      socketRef.current = socket;
      socket.onopen = () => { void request({ type: 'join', code: session.code, token: session.token }).catch(e => { if (!disposed) setProblem(e.message); }); };
      socket.onmessage = event => {
        if (disposed) return;
        let data; try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === 'snapshot') { attempts = 0; setSnapshot(data); setStatus('connected'); setProblem(''); }
        if (data.type === 'opened') setOpened(data);
        if (data.type === 'search-results') setResults(data.result);
        if (data.type === 'unavailable') { setSnapshot(null); setOpened(null); setResults(null); setStatus('unavailable'); setProblem(data.message); }
        if (data.type === 'ack' || data.type === 'error') {
          const p = pending.current.get(data.requestId);
          if (p) { window.clearTimeout(p.timer); pending.current.delete(data.requestId); data.type === 'ack' ? p.resolve() : p.reject(new Error(data.message)); }
          else if (data.type === 'error') setProblem(data.message);
        }
      };
      socket.onclose = () => {
        if (disposed) return;
        setStatus('unavailable'); setSnapshot(null); setOpened(null); setResults(null); rejectPending();
        setProblem('The memory exchange is unavailable. Your saved memories remain in the database.');
        timer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempts++));
      };
      socket.onerror = () => socket.close();
    }
    connect();
    return () => { disposed = true; window.clearTimeout(timer); socketRef.current?.close(); socketRef.current = null; rejectPending(); };
  }, [session.code, session.token, request]);
  useEffect(() => {
    if (!opened || !snapshot) return;
    const capsule = snapshot.capsules.find(c => c.id === opened.capsuleId);
    if (!capsule || !capsule.sourceAvailable || ['revoked', 'dismissed'].includes(capsule.status)) setOpened(null);
    else if (!snapshot.context.recordingAllowed && opened.source.audioUrl) setOpened({ ...opened, source: { ...opened.source, audioUrl: null } });
  }, [snapshot, opened]);
  return { snapshot, opened, results, status, problem, request, close: () => setOpened(null) };
}
