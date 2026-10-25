// A place you aren't in (New York): its shared memories are there, but clouded over with a "?" until you visit.
// Only how many and a blurred picture reach the page; no titles, words or names.
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, type CSSProperties } from 'react';
import { PLACES } from './state';
import { clouded, paintedSamples } from './world';
import { PlaceTop } from './WorldAlbum';

export function LockedPlace({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  const items = useMemo(() => clouded(paintedSamples()), []);
  const reduce = useReducedMotion();
  const city = PLACES.ny.name.split(',')[0];
  return (
    <section className="album" aria-labelledby="locked-h" data-testid="locked-place">
      <div className="album-scrim" aria-hidden="true" />
      <div className="album-scroll">
        <div className="album-inner">
          <PlaceTop onBack={onBack} onClose={onClose} />
          <motion.header className="album-head" initial={{ opacity: 0, y: reduce ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
            <p className="album-place">World memories</p>
            <h1 id="locked-h">{PLACES.ny.name}</h1>
            <p className="album-date">{items.length} memories were shared in {city}. You can open them when you’re there.</p>
          </motion.header>
          <ul className="clouded" aria-label={`${items.length} memories you can open in ${city}`}>
            {items.map((c, i) => (
              <motion.li key={c.id} className="clouded-pane" style={{ '--i': i } as CSSProperties} data-testid="clouded"
                initial={{ opacity: 0, y: reduce ? 0 : 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}>
                <div className="clouded-img" aria-hidden="true">{c.imageUrl && <img src={c.imageUrl} alt="" draggable={false} />}</div>
                <span className="clouded-fog" aria-hidden="true" />
                <span className="clouded-q" aria-hidden="true">?</span>
                <span className="visually-hidden">A memory you can open in {city}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
