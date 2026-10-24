import { ConvexProvider } from 'convex/react';
import { convex } from './backend/client';
import { SceneCanvas } from './scene/SceneCanvas';
import { GlassFilters } from './ui/GlassFilters';
import { Overlay } from './ui/Overlay';
import './flow/controller';
import { useSessionSync } from './flow/sync';

function Sync() { useSessionSync(); return null; }

export default function App() {
  return (
    <ConvexProvider client={convex}>
      <div className="app">
        <SceneCanvas />
        <Overlay />
        <GlassFilters />
        <Sync />
      </div>
    </ConvexProvider>
  );
}
