// The proposal memory's album pictures, taken from the real scene with its interface hidden (?shot=…): arriving on
// the path, the ring up close, and the two of them from the far side of the clearing. Run again whenever the scene
// changes, and World memories → San Francisco shows the new look. Same size and quality as album-pictures.mjs.
//   node apps/gate/scripts/proposal-pictures.mjs      (needs Gate on :5180; no backend)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const origin = process.env.GATE_ORIGIN ?? 'https://localhost:5180';
const outDir = path.resolve(here, '../public/memories/proposal');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
try {
  for (const [shot, name] of [['path', '1-path'], ['ring', '2-ring'], ['oak', '3-oak']]) {
    const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })).newPage();
    await page.goto(`${origin}/?story=proposal&shot=${shot}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__proposal?.ready(), null, { timeout: 120000 });
    await page.waitForTimeout(5000); // the meadow's detail settles around the view
    const file = path.join(outDir, `${name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 84 });
    console.log('saved', path.relative(process.cwd(), file));
    await page.context().close();
  }
} finally {
  await browser.close();
}
