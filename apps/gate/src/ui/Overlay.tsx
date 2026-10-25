// The DOM layer over the world: what's on screen at each part of the journey. Everything here is optional to use;
// the companion offers each thing out loud when it matters.
import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { cameBackToAlbum, PREPARED } from '../album/prepared';
import type { PlaceKey } from '../../../../packages/shared/src/places';
import { flow } from '../flow/controller';
import { useGate } from '../state/store';
import { Captions } from './Captions';
import { DropZone } from './DropZone';
import { InviteSheet } from './InviteSheet';
import { Offers } from './Offers';
import { Portal } from './Portal';
import { TopBar } from './TopBar';
import { XrButton } from './XrButton';
import { PresenceSync } from '../presence/PresenceSync';
import { SocialUI } from '../social/ui/SocialUI';
import { lazyRetry } from './lazyRetry';
import { MemoryAddOnsOverlay } from '../memory-addons/MemoryAddOns';

// The album stage: the memory map, and each place's memories (your album in San Francisco).
const Atlas = lazyRetry(() => import('../map/Atlas'));

/** If the album can't be fetched (a dropped connection), say so where it would be and offer to try again. */
class AlbumUnavailable extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error('[album] could not load', e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot" role="alert">
        <div>Your moments are kept, but they couldn’t be shown just now.<small>Check the Wi-Fi, then try again.</small></div>
        <button type="button" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  }
}

export function Overlay() {
  const stage = useGate((s) => s.stage);
  // Back from a prepared memory's own page (the Red Kite) that was opened in the album: the album again.
  useEffect(() => { if (cameBackToAlbum()) flow.openAlbum(); }, []);
  const world = useGate((s) => s.world);
  const day = stage === 'forming' || stage === 'memory' || stage === 'leaving';
  return (
    <div className={`overlay ${day ? 'on-paper' : ''}`} data-stage={stage} data-world={world}>
      {stage !== 'album' && stage !== 'entering' && <TopBar />}
      {stage === 'portal' && <Portal />}
      <Captions />
      <Offers />
      {stage === 'forming' && <FormingNote />}
      {stage === 'album' && (
        <AlbumUnavailable>
          <Suspense fallback={null}>
            <Atlas onBeginAnother={() => flow.again()} onRevisit={(id) => void flow.revisit(id)} onClose={() => flow.home()}
              onVisitScene={(scene) => { const m = PREPARED.find((p) => p.open && 'scene' in p.open && p.open.scene === scene); void flow.visitPlace(scene as PlaceKey, m?.plan ?? null); }} />
          </Suspense>
        </AlbumUnavailable>
      )}
      <XrButton />
      <InviteSheet />
      <DropZone />
      <PresenceSync />
      <SocialUI />
      <MemoryAddOnsOverlay />
    </div>
  );
}

function FormingNote() {
  return <p className="forming-note passthrough" aria-hidden="true" />;
}
