// Frame rate of a page in headless Chrome (Metal), from the app's own frame counter. Not a Quest measurement.
//   node apps/gate/scripts/fps.mjs "<url>" [--w 1440 --h 900] [--eval "js"]
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--disable-frame-rate-limit'] });
const page = await (await browser.newContext({ viewport: { width: Number(opt('w', 1440)), height: Number(opt('h', 900)) }, ignoreHTTPSErrors: true })).newPage();
await page.goto(args[0], { waitUntil: 'load' });
await page.waitForTimeout(5000);
if (opt('eval', null)) { await page.evaluate(opt('eval', null)); await page.waitForTimeout(Number(opt('after', 3000))); }
const f0 = await page.evaluate(() => window.__gateFrames ?? 0);
await page.waitForTimeout(4000);
const f1 = await page.evaluate(() => window.__gateFrames ?? 0);
console.log(`${args[0]} → ${((f1 - f0) / 4).toFixed(1)} fps`);
await browser.close();
