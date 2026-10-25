// The moments album. When someone leaves a memory, every moment they kept becomes a pane of liquid glass over the
// aurora, grouped by visit. Reach for a moment (hover, keyboard focus or a tap) and it opens: the place widens, its
// words and the person's own voice come forward, and the moments beside it make room. One opens at a time.
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { summaryLine, todayLine } from './format';
import { FromFamily } from './FromFamily';
import { MemoryChapter } from './MemoryChapter';
import { useGate } from '../state/store';
import { useAlbum } from './useAlbum';
import './album.css';
import { CloseIcon } from '../ui/Icons';
import { openPrepared, PREPARED } from './prepared';

export type AlbumViewProps = { onBeginAnother: () => void; onRevisit?: (memoryId: string) => void; onClose?: () => void; onVisitScene?: (scene: string) => void };

const HOVER_OPEN_MS = 130;
const HOVER_CLOSE_MS = 320;

export default function AlbumView({ onBeginAnother, onRevisit, onClose, onVisitScene }: AlbumViewProps) {
  const memories = useAlbum();
  // The team's prepared scenes, opened from here like any memory (after the person's own visits).
  const openSample = useCallback((id: string) => { const m = PREPARED.find((p) => p.id === id); if (m) openPrepared(m, onVisitScene); }, [onVisitScene]);
  const session = useGate((s) => s.session);
  const reduce = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };

  const onEnter = useCallback((id: string) => {
    if (pinned.current) return;
    clear();
    timer.current = setTimeout(() => setOpenId(id), HOVER_OPEN_MS);
  }, []);
  const onLeaveStrip = useCallback(() => {
    if (pinned.current) return;
    clear();
    timer.current = setTimeout(() => setOpenId(null), HOVER_CLOSE_MS);
  }, []);
  const onToggle = useCallback((id: string) => {
    clear();
    setOpenId((cur) => {
      if (cur === id && pinned.current) { pinned.current = false; return null; }
      pinned.current = true;
      return id;
    });
  }, []);
  const onFocusOpen = useCallback((id: string) => { clear(); pinned.current = true; setOpenId(id); }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { clear(); pinned.current = false; setOpenId(null); } };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); clear(); };
  }, []);

  const empty = memories.length === 0;
  return (
    <section className="album" aria-labelledby="album-h" data-testid="album">
      <div className="album-scrim" aria-hidden="true" />
      <div className="album-scroll" onClick={(e) => { if (!(e.target as Element).closest('.pane')) { clear(); pinned.current = false; setOpenId(null); } }}>
      <div className="album-inner">
        <div className="album-top">
          <div className="wordmark">Memory Gate</div>
          {onClose && (
            <button type="button" className="icon-btn glass album-close" aria-label="Back to the start" onClick={onClose} data-testid="album-close">
              <CloseIcon />
            </button>
          )}
        </div>
        <motion.header className="album-head" initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
          <h1 id="album-h">Your moments</h1>
          <p className="album-date">{todayLine()}</p>
          {!empty && <p className="album-summary">{summaryLine(memories)}</p>}
        </motion.header>
        {empty ? (
          <motion.div className="album-empty" initial={{ opacity: 0, y: reduce ? 0 : 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} data-testid="album-empty">
            <h2>Your first visit will be kept here</h2>
            <p>Each place you visit with the companion becomes a few moments: a picture of the place, and the words you shared there, in your own voice.</p>
            <button type="button" className="pill big album-cta" onClick={onBeginAnother} data-testid="album-begin">Visit a memory</button>
          </motion.div>
        ) : (
          memories.map((m, i) => (
            <MemoryChapter key={m.id} memory={m} index={i} openId={openId} onEnter={onEnter} onLeaveStrip={onLeaveStrip}
              onToggle={onToggle} onFocusOpen={onFocusOpen} onRevisit={onRevisit} />
          ))
        )}
        <section className="album-samples" aria-labelledby="album-samples-h" data-testid="album-samples">
          <h2 id="album-samples-h" className="album-section">Samples to step into</h2>
          {PREPARED.map((m, i) => (
            <MemoryChapter key={m.id} memory={m} index={(empty ? 1 : memories.length) + i} openId={openId} onEnter={onEnter} onLeaveStrip={onLeaveStrip}
              onToggle={onToggle} onFocusOpen={onFocusOpen} onRevisit={openSample} />
          ))}
        </section>
        <FromFamily session={session} />
      </div>
      </div>
      {!empty && <div className="album-fade" aria-hidden="true" />}
      {!empty && (
        <motion.div className="album-dock" initial={{ opacity: 0, y: reduce ? 0 : 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          <button type="button" className="pill big album-cta" onClick={onBeginAnother} data-testid="album-begin">Visit another memory</button>
        </motion.div>
      )}
    </section>
  );
}
