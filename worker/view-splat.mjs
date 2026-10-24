// Render a worker SPZ with Spark (headless Chromium) to eyeball it: the photo's viewpoint and a side view with a grid
// at floorY. Usage:
//   node worker/view-splat.mjs <file.spz> --floor -1.54 --fpx 842 --height 760 --name 1934 --out evidence/worker/1934
// Writes <out>-photo.png and <out>-floor.png. Serves three.js + Spark from the prep render spike (scratch/render-three).
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const spzFile = path.resolve(argv[0] ?? '');
if (!argv[0] || !existsSync(spzFile)) { console.error('usage: view-splat.mjs <file.spz> --floor Y --fpx F --height H [--name N] --out prefix'); process.exit(2); }
const floor = Number(opt('floor', '-1.2')), fpx = Number(opt('fpx', '0')), h = Number(opt('height', '0'));
const vfov = fpx > 0 && h > 0 ? (2 * Math.atan(h / 2 / fpx) * 180) / Math.PI : 50;
const aspect = Number(opt('aspect', '1.32'));
const out = path.resolve(opt('out', 'splat-check'));
const headsetRequire = createRequire(new URL('../apps/headset/package.json', import.meta.url));
const roots = { '/three/': path.dirname(path.dirname(headsetRequire.resolve('three'))), '/spark/': path.dirname(headsetRequire.resolve('@sparkjsdev/spark')) };
const here = path.dirname(new URL(import.meta.url).pathname);
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let file = null;
  if (u.pathname === '/') file = path.join(here, 'view-splat.html');
  else if (u.pathname === '/splat.spz') file = spzFile;
  else for (const [p, dir] of Object.entries(roots)) if (u.pathname.startsWith(p)) file = path.join(dir, path.normalize(decodeURIComponent(u.pathname.slice(p.length))).replace(/^(\.\.[/\\])+/, ''));
  if (!file || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.wasm' ? 'application/wasm' : 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
// Real Chrome with the GPU (as the prep render spike did); software GL is too slow for 500k splats.
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const W = 960;
const page = await browser.newPage({ viewport: { width: W, height: Math.round(W / aspect) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const results = {};
for (const view of ['photo', 'floor']) {
  await page.goto(`${base}/?spz=/splat.spz&floor=${floor}&vfov=${vfov}&view=${view}&name=${encodeURIComponent(opt('name', path.basename(spzFile)))}`);
  results[view] = await page.waitForFunction(() => window.__done, null, { timeout: 90000 }).then((x) => x.jsonValue())
    .catch(async (e) => ({ ok: false, error: String(e.message).split('\n')[0], frames: await page.evaluate(() => window.__frames ?? null), errors }));
  await page.screenshot({ path: `${out}-${view}.png` });
}
await browser.close();
server.close();
console.log(JSON.stringify({ spz: path.basename(spzFile), floor, vfov: +vfov.toFixed(1), results, pngs: [`${out}-photo.png`, `${out}-floor.png`], errors }));
