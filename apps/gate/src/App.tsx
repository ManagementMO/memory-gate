import { ConvexProvider } from 'convex/react';
import { convex } from './backend/client';
import { SceneCanvas } from './scene/SceneCanvas';
import { GlassFilters } from './ui/GlassFilters';
import { Overlay } from './ui/Overlay';
import './flow/controller';
import { useSessionSync } from './flow/sync';
import { lazy, Suspense } from 'react';

const RedKiteExperience = lazy(() => import('./red-kite/Experience'));
const ProposalExperience = lazy(() => import('./world-memory/ProposalExperience'));

function Sync() { useSessionSync(); return null; }

export default function App() {
  // The world memory showcased in San Francisco: static files only, so no backend connection is needed.
  if (new URLSearchParams(location.search).get('story') === 'proposal') return <Suspense fallback={null}><ProposalExperience /></Suspense>;
  if (new URLSearchParams(location.search).get('story') === 'red-kite') return <ConvexProvider client={convex}><Suspense fallback={null}><RedKiteExperience /></Suspense></ConvexProvider>;
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
