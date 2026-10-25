// The memory map: where your memories were made, and where other people have shared theirs. From the start page the
// album stage opens here; a pin opens that place (your album in San Francisco), and Map comes back. After a visit,
// the album opens straight onto San Francisco, so the moment just kept is the first thing seen.
import { motion, useReducedMotion } from 'motion/react';
import AlbumView, { type AlbumViewProps } from '../album/AlbumView';
import { PREPARED } from '../album/prepared';
import { useAlbum } from '../album/useAlbum';
import { useGate } from '../state/store';
import { CloseIcon } from '../ui/Icons';
import { PLACES, useAtlas, useVisibility, visibilityKey, type Pin, type Tab } from './state';
import { LockedPlace } from './LockedPlace';
import { NY_CLOUDED_COUNT, SF_SAMPLE_COUNT } from './world';
import { WorldAlbum } from './WorldAlbum';
import { WorldMap } from './WorldMap';
import './map.css';

const TABS: { id: Tab; label: string }[] = [{ id: 'mine', label: 'My memories' }, { id: 'world', label: 'World memories' }];

export default function Atlas(props: AlbumViewProps) {
  const tab = useAtlas((s) => s.tab);
  const place = useAtlas((s) => s.place);
  const show = useAtlas((s) => s.show);
  const back = () => show(null);
  if (place === 'sf' && tab === 'mine') return <AlbumView {...props} onBack={back} placeName={PLACES.sf.name} />;
  if (place === 'sf') return <WorldAlbum onBack={back} onClose={props.onClose} />;
  if (place === 'ny') return <LockedPlace onBack={back} onClose={props.onClose} />;
  return <MapScreen tab={tab} onTab={(t) => show(null, t)} onOpen={(p) => show(p)} onClose={props.onClose} />;
}

function MapScreen({ tab, onTab, onOpen, onClose }: { tab: Tab; onTab: (t: Tab) => void; onOpen: (p: 'sf' | 'ny') => void; onClose?: () => void }) {
  const memories = useAlbum();
  const code = useGate((s) => s.session?.code ?? null);
  const publicKeys = useVisibility((s) => s.publicKeys);
  const reduce = useReducedMotion();
  const shared = memories.filter((m) => publicKeys[visibilityKey(m, code)]).length;
  const pins: Pin[] = tab === 'mine'
    ? [{ place: 'sf', count: memories.length + PREPARED.length, locked: false }]
    : [{ place: 'sf', count: SF_SAMPLE_COUNT + shared, locked: false }, { place: 'ny', count: NY_CLOUDED_COUNT, locked: true }];
  return (
    <section className="album atlas" aria-labelledby="atlas-h" data-testid="map">
      <div className="album-scrim" aria-hidden="true" />
      <div className="album-scroll">
        <div className="album-inner">
          <div className="album-top atlas-top">
            <div className="wordmark">Memora</div>
            <div className="atlas-tabs glass" role="tablist" aria-label="Whose memories">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" id={`atlas-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="atlas-panel"
                  onClick={() => onTab(t.id)} data-testid={`map-tab-${t.id}`}>{t.label}</button>
              ))}
            </div>
            {onClose && (
              <button type="button" className="icon-btn glass album-close" aria-label="Back to the start" onClick={onClose} data-testid="map-close">
                <CloseIcon />
              </button>
            )}
          </div>
          <div role="tabpanel" id="atlas-panel" aria-labelledby={`atlas-tab-${tab}`}>
            <motion.header key={tab} className="album-head atlas-head" initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
              <h1 id="atlas-h">{tab === 'mine' ? 'Where your memories live' : 'Memories people share'}</h1>
              <p className="album-date">{tab === 'mine' ? 'Each pin is a place where you kept memories. Open one to see them.' : 'Open a place to see the albums people chose to share there.'}</p>
            </motion.header>
            <WorldMap title={TABS.find((t) => t.id === tab)!.label} pins={pins} onOpen={onOpen} />
          </div>
        </div>
      </div>
    </section>
  );
}
