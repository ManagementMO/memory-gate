// World memories in San Francisco: the albums people chose to share here, one person after another, in the same
// glass as your own album. Yours come first when you've made any public. Other people's memories can't be visited.
import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { usePaneOpen } from '../album/AlbumView';
import { MemoryChapter } from '../album/MemoryChapter';
import { useAlbum } from '../album/useAlbum';
import { useGate } from '../state/store';
import { BackIcon, CloseIcon } from '../ui/Icons';
import { PLACES, useVisibility, visibilityKey } from './state';
import { paintedSamples, publicMine, sampleAlbums } from './world';

/** Back to the map, and × back to the start page. */
export function PlaceTop({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  return (
    <div className="album-top">
      <button type="button" className="pill glass album-back" onClick={onBack} data-testid="album-back"><BackIcon /> Map</button>
      {onClose && (
        <button type="button" className="icon-btn glass album-close" aria-label="Back to the start" onClick={onClose} data-testid="album-close">
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

export function WorldAlbum({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  const memories = useAlbum();
  const code = useGate((s) => s.session?.code ?? null);
  const publicKeys = useVisibility((s) => s.publicKeys);
  const samples = useMemo(() => sampleAlbums(paintedSamples()), []);
  const mine = publicMine(memories, (m) => !!publicKeys[visibilityKey(m, code)]);
  const albums = mine ? [mine, ...samples] : samples;
  const { openId, onEnter, onLeaveStrip, onToggle, onFocusOpen, closeAll } = usePaneOpen();
  const reduce = useReducedMotion();
  const starts = albums.reduce<number[]>((acc, a, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + albums[i - 1]!.memories.length], []);
  return (
    <section className="album" aria-labelledby="world-h" data-testid="world-album">
      <div className="album-scrim" aria-hidden="true" />
      <div className="album-scroll" onClick={(e) => { if (!(e.target as Element).closest('.pane')) closeAll(); }}>
        <div className="album-inner">
          <PlaceTop onBack={onBack} onClose={onClose} />
          <motion.header className="album-head" initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
            <p className="album-place">{PLACES.sf.name}</p>
            <h1 id="world-h">World memories</h1>
            <p className="album-date">Albums people chose to share here.</p>
            {!mine && <p className="album-summary">Make one of your memories public and it will appear here too.</p>}
          </motion.header>
          {albums.map((a, ai) => (
            <section key={a.id} className="world-person" aria-labelledby={`${a.id}-h`} data-testid="world-person">
              <h2 id={`${a.id}-h`} className="album-section world-owner">{a.owner === 'You' ? 'Your public memories' : `${a.owner}’s album`}</h2>
              {a.memories.map((m, i) => (
                <MemoryChapter key={m.id} memory={m} index={starts[ai]! + i} openId={openId} onEnter={onEnter} onLeaveStrip={onLeaveStrip}
                  onToggle={onToggle} onFocusOpen={onFocusOpen} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
