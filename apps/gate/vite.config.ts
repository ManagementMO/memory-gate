// Memory Gate experience (Vite 8 + React 19 + React Three Fiber). One HTTPS origin serves the phone, the laptop and
// the Quest: the microphone and WebXR both need a secure context on the LAN, and /api is proxied (HTTP + WebSocket)
// to the local Convex backend, which only this computer can reach. The browser talks to Convex at its own origin.
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

/** The team's memory exchange gateway (SpacetimeDB): EXCHANGE_PORT from the repo's ignored .env.exchange, else 3212. */
function exchangeTarget(): string {
  if (process.env.EXCHANGE_PROXY_TARGET) return process.env.EXCHANGE_PROXY_TARGET;
  const envFile = path.join(repoRoot, '.env.exchange');
  const port = existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^EXCHANGE_PORT=(\d+)$/m)?.[1] : undefined;
  return `http://127.0.0.1:${port ?? '3212'}`;
}

const proxy: Record<string, ProxyOptions> = {
  '/api': { target: backendTarget(), changeOrigin: true, ws: true },
  // The gateway checks the browser's Origin itself, so it is passed through unchanged.
  '/exchange': { target: exchangeTarget(), ws: true },
};
const insecure = process.env.GATE_HTTP === '1'; // plain HTTP for automated screenshots only; mic/XR need HTTPS on the LAN

export default defineConfig({
  plugins: [react(), ...(insecure ? [] : [basicSsl()])],
  resolve: { dedupe: ['convex', 'react', 'react-dom', 'three', '@react-three/fiber'] },
  server: {
    host: process.env.GATE_HOST ?? '0.0.0.0',
    port: Number(process.env.GATE_PORT ?? 5180),
    strictPort: true,
    // Only what the app imports from outside apps/gate. Never the whole repo: the server is reachable on the Wi-Fi
    // and the repo holds .convex/ (the local backend's admin key), auth/ and .env.worker.
    fs: {
      strict: true,
      allow: [
        here,
        path.join(repoRoot, 'convex', '_generated'),
        path.join(repoRoot, 'packages', 'shared', 'src'),
        path.join(repoRoot, 'apps', 'headset', 'src', 'voice'),
      ],
      deny: ['.env', '.env.*', '*.env', '*.{crt,pem,key}', '**/.git/**', '**/.convex/**', '**/auth/**', '**/*.sqlite3'],
    },
    proxy,
  },
  // A Cloudflare quick tunnel (cloudflared tunnel --url https://localhost:4180) gives the headset a public HTTPS address
  // when the venue Wi-Fi keeps devices apart.
  preview: { host: process.env.GATE_HOST ?? '0.0.0.0', port: Number(process.env.GATE_PORT ?? 4180), strictPort: true, proxy, allowedHosts: ['.trycloudflare.com'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
});
