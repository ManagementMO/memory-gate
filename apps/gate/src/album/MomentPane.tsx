// One moment: a picture of the place behind a pane of liquid glass, with the words that shaped it on a frosted
// plate. Collapsed, it's a sliver of the place; hovered, focused or tapped, it widens and the plate tells the moment.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { momentLabel, timeOf } from './format';
import type { AlbumMemory, AlbumMoment } from './types';

let playing: HTMLAudioElement | null = null;

function VoiceButton({ url }: { url: string }) {
  const [on, setOn] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audio.current?.pause(); }, []);
  const toggle = () => {
    if (on && audio.current) { audio.current.pause(); return; }
    if (playing && playing !== audio.current) playing.pause();
    const a = audio.current ?? new Audio(url);
    audio.current = a;
    a.onplay = () => setOn(true);
    a.onpause = () => setOn(false);
    a.onended = () => setOn(false);
    a.currentTime = 0;
    playing = a;
    void a.play().catch(() => setOn(false));
  };
  return (
    <button type="button" className="plate-btn" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-pressed={on} data-testid="moment-voice">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        {on ? <path d="M7 6h3.5v12H7zM13.5 6H17v12h-3.5z" /> : <path d="M8 5.6v12.8L18.2 12z" />}
      </svg>
      {on ? 'Stop' : 'Hear it again'}
    </button>
  );
}

export type PaneProps = {
  moment: AlbumMoment;
  memory: AlbumMemory;
  open: boolean;
  base: number;
  onEnter: () => void;
  onToggle: () => void;
  onFocusOpen: () => void;
  onRevisit?: (memoryId: string) => void;
  /** Position within its visit (staggers the sheen of light as the album forms). */
  index?: number;
};

export function MomentPane({ moment, memory, open, base, onEnter, onToggle, onFocusOpen, onRevisit, index = 0 }: PaneProps) {
  const reduce = useReducedMotion();
  const li = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!open || !matchMedia('(max-width: 720px)').matches) return;
    const go = () => li.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    const a = setTimeout(go, 280), b = setTimeout(go, 840); // once as it opens, once when it has settled
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [open, reduce]);
  const tint = memory.palette[0] ?? '#b9a6ff';
  const id = `moment-${moment.id}`;
  const quoted = moment.speaker === 'you' ? `“${moment.caption}”` : moment.caption;
  const style = { '--grow': open ? base + 2.4 : base, '--tint': tint, '--i': index } as CSSProperties;
  const specular = (e: PointerEvent<HTMLLIElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  return (
    <motion.li
      ref={li}
      className="pane"
      data-open={open}
      data-kind={moment.kind}
      style={style}
      variants={{ hidden: { opacity: 0, y: reduce ? 0 : 28 }, shown: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } }}
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') onEnter(); }}
      onPointerMove={specular}
      data-testid="moment"
    >
      <div className="pane-img" aria-hidden="true">
        {moment.imageUrl ? <img src={moment.imageUrl} alt="" draggable={false} /> : <div className="pane-fallback" />}
      </div>
      <span className="pane-sheen" aria-hidden="true" />
      <button
        type="button"
        className="pane-hit"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${momentLabel(moment)}, ${timeOf(moment.at)}: ${moment.caption}`}
        onClick={onToggle}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) onFocusOpen(); }}
      />
      <AnimatePresence>
        {open && moment.sourceUrl && (
          <motion.figure className="pane-source" initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, delay: 0.25 }}>
            <img src={moment.sourceUrl} alt={memory.source === 'video' ? 'A still from the video you shared' : 'The photo you shared'} />
            <figcaption>{memory.source === 'video' ? 'From your video' : 'From your photo'}</figcaption>
          </motion.figure>
        )}
      </AnimatePresence>
      <div className="plate" id={id}>
        <p className="plate-label"><span>{momentLabel(moment)}</span><span className="plate-time">{timeOf(moment.at)}</span></p>
        <p className={`plate-caption by-${moment.speaker}`}>{quoted}</p>
        <AnimatePresence initial={false}>
          {open && (moment.audioUrl || onRevisit) && (
            <motion.div className="plate-actions" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 4 }} transition={{ duration: 0.45, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}>
              {moment.audioUrl && <VoiceButton url={moment.audioUrl} />}
              {onRevisit && (
                <button type="button" className="plate-btn quiet" onClick={(e) => { e.stopPropagation(); onRevisit(memory.id); }} data-testid="moment-revisit">
                  Visit again
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}
