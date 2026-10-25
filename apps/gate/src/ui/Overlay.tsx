// The DOM layer over the world: what's on screen at each part of the journey. Everything here is optional to use;
// the companion offers each thing out loud when it matters.
import { Component, Suspense, type ReactNode } from 'react';
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
import { lazyRetry } from './lazyRetry';

const AlbumView = lazyRetry(() => import('../album/AlbumView'));

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
            <AlbumView onBeginAnother={() => flow.again()} onRevisit={(id) => void flow.revisit(id)} />
          </Suspense>
        </AlbumUnavailable>
      )}
      <XrButton />
      <InviteSheet />
      <DropZone />
      <PresenceSync />
    </div>
  );
}

function FormingNote() {
  return <p className="forming-note passthrough" aria-hidden="true" />;
}
