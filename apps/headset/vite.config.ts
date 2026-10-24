// Headset dev server: IWSDK's plugin (HTTPS with a local cert, IWER emulator in dev only) plus a same-origin proxy
// to the local Convex backend. The Quest reaches everything through this one HTTPS origin (LAN or `adb reverse`),
// so there is no mixed content and no CORS. Only the backend's public URL is read here (no secrets, no VITE_ vars).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function backendUrl(): string {
  if (process.env.CONVEX_URL) return process.env.CONVEX_URL;
  try {
    const env = readFileSync(`${repoRoot}/.env.local`, 'utf8');
    const m = env.match(/^CONVEX_URL=(.+)$/m);
    if (m?.[1]) return m[1].trim();
  } catch { /* no .env.local: fall back to the local default */ }
  return 'http://127.0.0.1:3210';
}
const CONVEX = backendUrl();

export default defineConfig({
  plugins: [iwsdkDev()],
  define: {
    // The backend origin that storage URLs start with; the app rewrites it to its own origin (see src/net.ts).
    __MG_BACKEND_ORIGIN__: JSON.stringify(new URL(CONVEX).origin),
    // Dev-only library facing check (?check=models) reads the seed GLBs from fixtures/large.
    __MG_FIXTURES__: JSON.stringify(`${repoRoot.replace(/\/$/, '')}/fixtures/large`),
  },
  server: {
    host: '0.0.0.0',
    port: 8081,
    strictPort: true,
    open: false,
    // Serve ONLY what the app needs from outside its folder. The repo root holds .convex/ (the local backend's admin
    // key) and .env files, and this server is reachable on the LAN, so never allow the whole repo.
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)), // this app (src, public, node_modules)
        `${repoRoot}convex/_generated`,
        `${repoRoot}packages/shared/src`,
        `${repoRoot}fixtures/large`, // dev-only ?check=models facing check
      ],
      deny: ['.env', '.env.*', '*.env', '*.{crt,pem,key}', '**/.convex/**', '**/auth/**', '**/.git/**',
        // headset test state (a test room's member token), IWSDK runtime/session files, generated MCP config
        '**/.test-room*.json', '**/.iwsdk/**', '**/.mcp.json'],
    },
    proxy: {
      // Convex sync WebSocket, HTTP API and file storage (GET /api/storage/<id>, POST /api/storage/upload).
      '/api': { target: CONVEX, changeOrigin: true, ws: true },
    },
  },
  preview: {
    proxy: { '/api': { target: CONVEX, changeOrigin: true, ws: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (three@0.185 vs app super-three@0.181). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  // `convex` is deduped so ../../convex/_generated/api.js uses this app's copy.
  resolve: {
    dedupe: [
      'three',
      'convex',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      'convex/browser',
      'convex/server',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
