// Visual review helper: open the experience in headless Chrome (real GPU via Metal), optionally drive it, and save
// screenshots. Used by the dogfood loop and for design review.
//   node apps/gate/scripts/shot.mjs <url> <out.png> [--w 1440] [--h 900] [--wait 4000] [--dpr 1] [--mobile]
//        [--eval "js to run in the page before the shot"] [--frames 3 --every 1500]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
if (!url || !out) { console.error('usage: shot.mjs <url> <out.png> [--w --h --wait --dpr --mobile --eval --frames --every]'); process.exit(2); }

const mobile = flag('mobile');
const width = Number(opt('w', mobile ? 390 : 1440));
const height = Number(opt('h', mobile ? 844 : 900));
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(opt('dpr', mobile ? 2 : 1)), ignoreHTTPSErrors: true, isMobile: mobile, hasTouch: mobile, permissions: ['microphone'] });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(opt('wait', 4000)));
const script = opt('eval', null);
if (script) { await page.evaluate(script); await page.waitForTimeout(Number(opt('after', 2500))); }
const frames = Number(opt('frames', 1));
for (let i = 0; i < frames; i++) {
  const file = frames === 1 ? out : out.replace(/\.png$/, `-${i + 1}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
  if (i < frames - 1) await page.waitForTimeout(Number(opt('every', 1500)));
}
if (logs.length) console.log(logs.slice(0, 25).join('\n'));
await browser.close();
