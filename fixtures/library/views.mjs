// Facing check for the object library: renders each GLB from +Z, +X, -Z, -X and a "front check" after
// rotation.y = yawOffset (seen from +Z), into evidence/library/<key>.png. Run from the practice repo root:
//   node fixtures/library/views.mjs                    # every LIBRARY row in scripts/seed.mjs, with its yawOffset
//   node fixtures/library/views.mjs piano=-0.5 rug=0   # only these keys; yaw given in units of PI (overrides seed)
// Serves three.js (scratch/render-three, prep-only) and fixtures/large/ on 127.0.0.1 (random port); headless Chromium
// via the repo's Playwright. Prints one JSON line per model (bbox proportions, triangles, yaw).
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const THREE_DIR = process.env.THREE_DIR || path.join(process.env.HOME, 'memory-gate-prep', 'scratch', 'render-three', 'node_modules', 'three');
const LARGE = path.join(REPO, 'fixtures', 'large');
const OUT = path.join(REPO, 'evidence', 'library');
if (!existsSync(path.join(THREE_DIR, 'build', 'three.module.js'))) { console.error(`three.js not found at ${THREE_DIR} (set THREE_DIR)`); process.exit(2); }

// The LIBRARY array literal from seed.mjs (plain literals and Math.PI only), so the check always matches the seed.
function seedLibrary() {
  const src = readFileSync(path.join(REPO, 'scripts', 'seed.mjs'), 'utf8');
  const m = src.match(/const LIBRARY = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('LIBRARY array not found in scripts/seed.mjs');
  return new Function(`return ${m[1]};`)();
}
const lib = seedLibrary();
const overrides = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.lastIndexOf('='); return [a.slice(0, i), Number(a.slice(i + 1)) * Math.PI]; }));
const rows = (Object.keys(overrides).length ? lib.filter((l) => l.key in overrides) : lib)
  .map((l) => ({ key: l.key, file: path.basename(l.file), yaw: l.key in overrides ? overrides[l.key] : l.yawOffset }));
for (const k of Object.keys(overrides)) if (!rows.some((r) => r.key === k)) {
  const file = `${k.replace(/ /g, '-')}.glb`; // not in the seed yet: try fixtures/large/<key>.glb
  if (existsSync(path.join(LARGE, file))) rows.push({ key: k, file, yaw: overrides[k] }); else console.error(`skip ${k}: no row and no ${file}`);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let file = null;
  if (u.pathname === '/') file = path.join(HERE, 'views.html');
  else if (u.pathname.startsWith('/three/')) file = path.join(THREE_DIR, path.normalize(decodeURIComponent(u.pathname.slice(7))).replace(/^(\.\.[/\\])+/, ''));
  else if (u.pathname.startsWith('/glb/')) file = path.join(LARGE, path.basename(decodeURIComponent(u.pathname.slice(5))));
  if (!file || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
let failed = 0;
for (const r of rows) {
  await page.goto(`${base}/?glb=${encodeURIComponent(r.file)}&key=${encodeURIComponent(r.key)}&yaw=${r.yaw}`);
  const done = await page.waitForFunction(() => window.__done, null, { timeout: 60000 }).then((h) => h.jsonValue());
  const png = path.join(OUT, `${r.key.replace(/ /g, '-')}.png`);
  await page.locator('#sheet').screenshot({ path: png });
  if (!done.ok) failed++;
  console.log(JSON.stringify({ key: r.key, ok: done.ok, error: done.error, yawPi: +(r.yaw / Math.PI).toFixed(3), bbox: done.bbox, rawLargest: done.rawLargest, triangles: done.triangles, png: path.relative(REPO, png) }));
}
if (errors.length) console.log(JSON.stringify({ pageErrors: errors }));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
