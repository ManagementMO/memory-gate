// Memory Gate experience (Vite 8 + React 19 + React Three Fiber). One HTTPS origin serves the phone, the laptop and
// the Quest: the microphone and WebXR both need a secure context on the LAN, and /api is proxied (HTTP + WebSocket)
// to the local Convex backend, which only this computer can reach. The browser talks to Convex at its own origin.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';

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
  // The gateway checks the browser's Origin itself, so it is passed through unchanged, except for this page's own
  // tunnel address (it changes every time the tunnel starts): the gateway sees this server's local origin instead.
  '/exchange': {
    target: exchangeTarget(), ws: true,
    configure: (p) => p.on('proxyReqWs', (proxyReq, req) => {
      const host = req.headers.host ?? '';
      if (host.endsWith('.trycloudflare.com') && req.headers.origin === `https://${host}`) proxyReq.setHeader('origin', `https://localhost:${req.socket.localPort}`);
    }),
  },
};

/**
 * Headsets can't show their console: the page posts its errors and a heartbeat (src/diag/deviceLog.ts) here, and they
 * land in .logs/devices.log on this computer. Small bodies only, and the file stops growing at 5 MB.
 */
function deviceLog(): Plugin {
  const file = path.join(repoRoot, '.logs', 'devices.log');
  const handle = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== '/__device-log' || req.method !== 'POST') return next();
    let body = '';
    req.on('data', (c: Buffer) => { if (body.length < 8000) body += c.toString('utf8'); });
    req.on('end', () => {
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        if (!existsSync(file) || statSync(file).size < 5e6) appendFileSync(file, body.slice(0, 8000).replace(/\n/g, ' ') + '\n', { mode: 0o600 });
      } catch { /* never fail the page */ }
      res.statusCode = 204; res.end();
    });
  };
  return { name: 'device-log', configureServer: (s) => { s.middlewares.use(handle); }, configurePreviewServer: (s) => { s.middlewares.use(handle); } };
}
const insecure = process.env.GATE_HTTP === '1'; // plain HTTP for automated screenshots only; mic/XR need HTTPS on the LAN

/**
 * The headset build through a tunnel: hashed files under /assets never change, so they go out compressed once
 * (brotli or gzip, kept in memory) and marked immutable, which lets Cloudflare's edge keep them. After one load
 * the headset gets them from the edge instead of this computer's Wi-Fi.
 */
function servePacked(): Plugin {
  const packed = new Map<string, { br: Buffer; gz: Buffer; type: string }>();
  return {
    name: 'serve-packed',
    configurePreviewServer: (server) => {
      const dist = path.resolve(here, server.config.build.outDir);
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]!;
        const m = /^\/assets\/[\w.-]+\.(js|css|wasm|json|svg)$/.exec(url);
        if (!m || req.method !== 'GET') return next();
        const file = path.join(dist, url);
        if (!existsSync(file)) return next();
        let hit = packed.get(file);
        if (!hit) {
          const raw = readFileSync(file);
          hit = {
            br: brotliCompressSync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9 } }), gz: gzipSync(raw, { level: 9 }),
            type: { js: 'text/javascript', css: 'text/css', wasm: 'application/wasm', json: 'application/json', svg: 'image/svg+xml' }[m[1]!]!,
          };
          packed.set(file, hit);
        }
        const accept = String(req.headers['accept-encoding'] ?? '');
        const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
        res.setHeader('Content-Type', `${hit.type}; charset=utf-8`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Vary', 'Accept-Encoding');
        if (!enc) return void res.end(readFileSync(file));
        res.setHeader('Content-Encoding', enc);
        res.end(enc === 'br' ? hit.br : hit.gz);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), deviceLog(), servePacked(), ...(insecure ? [] : [basicSsl()])],
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
