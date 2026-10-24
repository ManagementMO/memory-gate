// LAN check: open the headset page on the Mac's Wi-Fi address (as the Quest would), in headless Chrome, and prove the
// room query (WebSocket), the splat and the GLBs all load through this one HTTPS origin's /api proxy.
// Usage: node scripts/lan-check.mjs [https://<lan-ip>:8081/]   (room from .test-room.json)
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const room = JSON.parse(readFileSync(new URL('../.test-room.json', import.meta.url), 'utf8'));
const ip = (() => { try { return execSync('ipconfig getifaddr en0').toString().trim(); } catch { return '127.0.0.1'; } })();
const base = process.argv[2] || `https://${ip}:8081/`;
const out = process.argv[3] || null;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } })).newPage();
const reqs = [], sockets = [], errors = [];
page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) reqs.push({ origin: u.origin, path: u.pathname.replace(/[0-9a-f-]{36}/, '<id>'), status: r.status(), type: r.headers()['content-type'] ?? '' }); });
page.on('websocket', (ws) => sockets.push(ws.url().replace(/\?.*$/, '')));
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const t0 = Date.now();
await page.goto(`${base}?room=${room.code}${room.key ? `&key=${room.key}` : ''}&voice=mock`);
await page.waitForFunction(() => window.__mg?.stats?.splatLoaded === true, null, { timeout: 60000 });
await page.waitForFunction(() => !/loading/.test(window.__mg?.stats?.objects ?? 'loading'), null, { timeout: 30000 }).catch(() => undefined);
await page.waitForTimeout(3000);
if (out) await page.screenshot({ path: out });
const s = await page.evaluate(() => window.__mg.stats);
console.log(JSON.stringify({ base, pageOrigin: new URL(page.url()).origin, msToSplat: s.tSplatReady, splatUrl: s.splatUrl, objects: s.objects, objectRecords: s.objectRecords,
  websockets: [...new Set(sockets)], apiResponses: reqs, errors, tookMs: Date.now() - t0 }, null, 1));
await browser.close();
