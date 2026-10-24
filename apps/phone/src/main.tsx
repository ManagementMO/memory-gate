import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { CONVEX_URL } from './backend';
import './styles.css';

// The URL is this page's origin (the dev server proxies /api to Convex), so skip the *.convex.cloud check.
const client = new ConvexReactClient(CONVEX_URL, { skipConvexDeploymentUrlCheck: true, unsavedChangesWarning: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ConvexProvider client={client}>
        <App />
      </ConvexProvider>
    </ErrorBoundary>
  </StrictMode>,
);
