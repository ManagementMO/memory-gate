import { Component, StrictMode, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { lazyRetry } from './ui/lazyRetry';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/glass.css';
import './styles/app.css';
import './diag/deviceLog';

// ?preview=figure|light|album|library|scene renders one piece in isolation (used for visual review and by the test suite).
const preview = new URLSearchParams(location.search).get('preview');

/** While the experience downloads: a breathing light, and a word if it's taking a while. */
function Opening() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 9000); return () => clearTimeout(t); }, []);
  return (
    <div className="boot" role="status">
      <i />
      <div>Opening the gate…<small>{slow ? 'Still on its way. The connection is slow.' : ''}</small></div>
    </div>
  );
}

/** If it never arrives: say so plainly and offer to try again (a reload picks up what already arrived). */
class Unopened extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error('[gate] could not load', e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot" role="alert">
        <div>The gate couldn’t open on this connection.<small>Check the Wi-Fi, then try again.</small></div>
        <button type="button" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  }
}

const App = lazyRetry(() => import('./App'));
const FigurePreview = lazy(() => import('./previews/FigurePreview'));
const LightPreview = lazy(() => import('./previews/LightPreview'));
const AlbumPreview = lazy(() => import('./previews/AlbumPreview'));
const LibraryPreview = lazy(() => import('./previews/LibraryPreview'));
const ScenePreview = lazy(() => import('./previews/ScenePreview'));

const Root = preview === 'figure' ? FigurePreview : preview === 'light' ? LightPreview : preview === 'album' ? AlbumPreview
  : preview === 'library' ? LibraryPreview : preview === 'scene' ? ScenePreview : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Unopened>
      <Suspense fallback={<Opening />}>
        <Root />
      </Suspense>
    </Unopened>
  </StrictMode>,
);
