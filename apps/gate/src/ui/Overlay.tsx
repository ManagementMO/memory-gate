// The DOM layer over the world: what's on screen at each part of the journey. Everything here is optional to use;
// the companion offers each thing out loud when it matters.
import { lazy, Suspense } from 'react';
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

const AlbumView = lazy(() => import('../album/AlbumView'));

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
        <Suspense fallback={null}>
          <AlbumView onBeginAnother={() => flow.again()} onRevisit={(id) => void flow.revisit(id)} />
        </Suspense>
      )}
      <XrButton />
      <InviteSheet />
      <DropZone />
      <PresenceSync />
      <SocialUI />
    </div>
  );
}

function FormingNote() {
  return <p className="forming-note passthrough" aria-hidden="true" />;
}
