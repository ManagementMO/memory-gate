// One visit: its name, when and how it began, then its moments as strips of glass (at most five per strip, so a pane
// is never a sliver). The arriving moment starts widest; whichever moment you reach for opens and the others make room.
import { motion, useReducedMotion } from 'motion/react';
import { memoryLine } from './format';
import { MomentPane } from './MomentPane';
import type { AlbumMemory, AlbumMoment } from './types';

const PER_STRIP = 5;
const baseOf = (m: AlbumMoment) => (m.kind === 'arrival' ? 1.8 : m.kind === 'final' ? 1.2 : 1);

export type ChapterProps = {
  memory: AlbumMemory;
  index: number;
  openId: string | null;
  onEnter: (id: string) => void;
  onLeaveStrip: () => void;
  onToggle: (id: string) => void;
  onFocusOpen: (id: string) => void;
  onRevisit?: (memoryId: string) => void;
  /** Under the strips: who can see this memory, for the person's own visits. */
  footer?: React.ReactNode;
};

export function MemoryChapter({ memory, index, openId, onEnter, onLeaveStrip, onToggle, onFocusOpen, onRevisit, footer }: ChapterProps) {
  const reduce = useReducedMotion();
  const strips: AlbumMoment[][] = [];
  for (let i = 0; i < memory.moments.length; i += PER_STRIP) strips.push(memory.moments.slice(i, i + PER_STRIP));
  const headingId = `memory-${memory.id}`;
  return (
    <motion.section
      className="memory"
      aria-labelledby={headingId}
      initial="hidden"
      animate="shown"
      variants={{ hidden: { opacity: 0, y: reduce ? 0 : 24 }, shown: { opacity: 1, y: 0, transition: { duration: 1, delay: 0.35 + index * 0.16, ease: [0.22, 1, 0.36, 1], when: 'beforeChildren', staggerChildren: 0.09 } } }}
      style={{ '--tint': memory.palette[0] ?? '#b9a6ff' } as React.CSSProperties}
      data-testid="memory"
    >
      <header className="memory-head">
        <h2 id={headingId}>{memory.title}</h2>
        <p>
          {memoryLine(memory)}
          {memory.sample && <span className="sample-chip">Sample</span>}
        </p>
      </header>
      {strips.map((strip, si) => (
        <motion.ul key={si} className="strip" onPointerLeave={onLeaveStrip} variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.08 } } }}>
          {strip.map((m, mi) => (
            <MomentPane key={m.id} moment={m} memory={memory} open={openId === m.id} base={baseOf(m)} index={si * PER_STRIP + mi}
              onEnter={() => onEnter(m.id)} onToggle={() => onToggle(m.id)} onFocusOpen={() => onFocusOpen(m.id)} onRevisit={onRevisit} />
          ))}
        </motion.ul>
      ))}
      {footer}
    </motion.section>
  );
}
