// The prepared memories' album pictures, taken from the real scenes (no illustration, no UI): run again whenever a
// scene is polished, and the album shows the new look.
//   node apps/gate/scripts/album-pictures.mjs red-kite      (needs local Convex, `npm run demo:kite`, and Gate on :5180)
//   node apps/gate/scripts/album-pictures.mjs courtyard     (needs local Convex, `npm run seed:world`, and Gate on :5180)
// Writes 1280x800 JPEGs to apps/gate/public/memories/<scene>/. The Red Kite pictures follow the sample's own story:
// Elena on the path, her red kite, Rosa beside the oak with her orange one, and the afternoon they didn't want to end.
import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scene = process.argv[2] ?? 'red-kite';
const origin = process.env.GATE_ORIGIN ?? 'https://localhost:5180';
const outDir = path.resolve(here, '../public/memories', scene);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

/** Hide every piece of the page's interface so the picture is only the place. */
const bare = (page, selectors) => page.evaluate((s) => { for (const el of document.querySelectorAll(s)) el.style.visibility = 'hidden'; }, selectors.join(','));
const shoot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: 1600, height: 1000 } });
  console.log('saved', path.join(path.relative(process.cwd(), outDir), `${name}.jpg`));
};

try {
  if (scene === 'red-kite') {
    const auth = JSON.parse(readFileSync(path.resolve(here, '../../../.logs/red-kite-demo-room.json'), 'utf8'));
    await ctx.addInitScript((s) => localStorage.setItem('mg.red-kite.session.' + s.code, JSON.stringify({ code: s.code, token: s.token, role: 'family' })), auth);
    const page = await ctx.newPage();
    const ui = ['.rk-header', '.rk-perspectives', '.rk-place-note', '.rk-visual-status', '.rk-story', '.rk-footer', '.rk-notice', '.rk-mobile-rest', '.rk-comparison', '.rk-switching', '.rk-resting'];
    const show = () => page.evaluate((s) => { for (const el of document.querySelectorAll(s)) el.style.visibility = ''; }, ui.join(','));
    const settle = () => page.waitForFunction(() => window.__redKite3D?.snapshot().phase === 'idle', null, { timeout: 20000 });
    const next = async () => { await page.getByTestId('next-line').click(); await page.waitForTimeout(700); };
    const use = async () => { await page.getByTestId('use-look').click(); await page.waitForTimeout(1600); };
    await page.goto(`${origin}/?story=red-kite&room=${auth.code}`);
    await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 60000 });
    await expect(page.getByTestId('restart-story')).toBeEnabled({ timeout: 15000 });
    await page.getByTestId('restart-story').click();
    await page.waitForTimeout(2500);
    // 1. Arriving with Elena on the path: the oak at the bend, no kite yet.
    await bare(page, ui); await page.waitForTimeout(900); await shoot(page, '1-path'); await show();
    // 2. Her kite, red with a cream ribbon.
    await next(); await use(); await next(); await use();
    await bare(page, ui); await page.waitForTimeout(1500); await shoot(page, '2-red-kite'); await show();
    // 3. Rosa's telling, from beside the oak: the same kite, orange in her light.
    await page.getByTestId('perspective-rosa').click(); await settle(); await page.waitForTimeout(800);
    await next(); await use(); await next(); await use();
    await bare(page, ui); await page.waitForTimeout(1500); await shoot(page, '3-rosa-oak'); await show();
    // 4. Back on the path at the end of the afternoon.
    await page.getByTestId('perspective-elena').click(); await settle(); await next(); await page.waitForTimeout(1200);
    await bare(page, ui); await page.waitForTimeout(1200); await shoot(page, '4-afternoon'); await show();
  } else if (scene === 'courtyard') {
    // A visit the way anyone would make it: told to the companion, then filled in by naming things inside.
    const page = await ctx.newPage();
    const hear = async (t, ms = 3500) => { await page.evaluate((x) => window.__gate.flow.testHear(x), t); await page.waitForTimeout(ms); };
    const pin = (c) => page.evaluate((v) => { window.__cam = v; }, c);
    await page.goto(`${origin}/?mode=offline&voice=off`);
    await page.waitForTimeout(3500);
    await page.getByTestId('begin').click();
    await page.waitForFunction(() => window.__gate.store.getState().stage === 'gathering', null, { timeout: 40000 });
    await hear('I remember my grandmother’s courtyard, with the grape vines over the pergola.');
    await hear('She had a table under the vines with two chairs, and always a teapot.');
    await page.evaluate(() => window.__gate.flow.enter());
    await page.waitForFunction(() => window.__gate.store.getState().stage === 'memory', null, { timeout: 120000 });
    await page.waitForTimeout(4000);
    await bare(page, ['.overlay']);
    await page.waitForTimeout(600); await shoot(page, '1-courtyard');
    await hear('There was a bowl of lemons and her old radio on the table.', 5000);
    await pin([0.95, 1.3, 1.45, -0.05, 0.75, 2.95]); await page.waitForTimeout(1200); await shoot(page, '2-table');
    await hear('And a bench by the wall, with pots of plants.', 5000);
    await pin([0.95, 1.55, 0.15, -0.85, 0.7, 3.1]); await page.waitForTimeout(1200); await shoot(page, '3-bench');
  } else {
    throw new Error(`No picture recipe for "${scene}" yet.`);
  }
} finally {
  await browser.close();
}
