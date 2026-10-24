// Memory Gate phone app (Vite 8 + React 19). The dev server binds 0.0.0.0:5173 so a phone or Quest on the same Wi-Fi
// can open it, and it proxies Convex (/api, HTTP + WebSocket) to the local backend, which only the computer can reach.
// The browser therefore talks to Convex at window.location.origin (see src/backend.ts).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type ProxyOptions } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

/** The backend the proxy forwards to: CONVEX_PROXY_TARGET, else CONVEX_URL from the repo's .env.local (public URL, no secrets). */
function backendTarget(): string {
  if (process.env.CONVEX_PROXY_TARGET) return process.env.CONVEX_PROXY_TARGET;
  const envFile = path.join(repoRoot, '.env.local');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^CONVEX_URL=(.+)$/m);
    if (m?.[1]) return m[1].trim();
  }
  return 'http://127.0.0.1:3210';
}

const proxy: Record<string, ProxyOptions> = { '/api': { target: backendTarget(), changeOrigin: true, ws: true } };
const securePhone = process.env.PHONE_HTTPS === '1';

export default defineConfig({
  plugins: [react(), ...(securePhone ? [basicSsl()] : [])],
  resolve: { dedupe: ['convex', 'react', 'react-dom'] },
  server: {
    host: process.env.PHONE_HOST ?? '0.0.0.0',
    port: securePhone ? 5174 : 5173,
    strictPort: true,
    // Only what the app imports from outside apps/phone. Never the whole repo: the server is reachable on the Wi-Fi
    // and the repo holds .convex/local/*/config.json (the local backend's admin key) and .env.worker.
    fs: {
      strict: true,
      allow: [
        here,
        path.join(repoRoot, 'convex', '_generated'),
        path.join(repoRoot, 'packages', 'shared', 'src'),
        path.join(repoRoot, 'apps', 'headset', 'src', 'voice'),
        path.join(repoRoot, 'fixtures', 'sample-photo-1938.jpg'),
      ],
      deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/.convex/**', '**/auth/**', '**/*.sqlite3'],
    },
    proxy,
  },
  preview: { host: process.env.PHONE_HOST ?? '0.0.0.0', port: 4173, strictPort: true, proxy },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
