import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/glass.css';
import './styles/app.css';

// ?preview=figure|light|album|library|scene renders one piece in isolation (used for visual review and by the test suite).
const preview = new URLSearchParams(location.search).get('preview');
const App = lazy(() => import('./App'));
const FigurePreview = lazy(() => import('./previews/FigurePreview'));
const LightPreview = lazy(() => import('./previews/LightPreview'));
const AlbumPreview = lazy(() => import('./previews/AlbumPreview'));
const LibraryPreview = lazy(() => import('./previews/LibraryPreview'));
const ScenePreview = lazy(() => import('./previews/ScenePreview'));

const Root = preview === 'figure' ? FigurePreview : preview === 'light' ? LightPreview : preview === 'album' ? AlbumPreview
  : preview === 'library' ? LibraryPreview : preview === 'scene' ? ScenePreview : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>,
);
