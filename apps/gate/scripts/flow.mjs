// End-to-end walk through the whole journey, the way a person would take it, with screenshots at every stage.
// Free by default: an offline room (paid services forced off by the server) and no voice engine; the person's words
// are delivered through the page's test hook because a headless browser can't speak.
//   node apps/gate/scripts/flow.mjs <outDir> [--base https://localhost:5180] [--mobile] [--companion light|figure]
//        [--words "..."] [--live] (live = real Claude through the backend; spends tokens)
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args[0] ?? 'apps/gate/.shots/flow';
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
mkdirSync(out, { recursive: true });
const base = opt('base', 'https://localhost:5180');
const mobile = flag('mobile');
const companion = opt('companion', 'figure');
const photo = opt('photo', null);
const words = opt('words', 'My grandmother’s kitchen, in the morning. Yellow curtains on the window, a round wooden table with two chairs, and her radio on the counter.');
const url = `${base}/?voice=off&companion=${companion}${flag('live') ? '' : '&mode=offline'}`;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
const t0 = Date.now();
const log = [];
const note = (s) => { const line = `${((Date.now() - t0) / 1000).toFixed(1)}s  ${s}`; log.push(line); console.log(line); };
const state = () => page.evaluate(() => { const g = window.__gate.store.getState(); return { stage: g.stage, said: g.companionLine?.text ?? null, heard: g.heardLine?.text ?? null, voice: g.voice, session: !!g.session, title: g.memoryTitle, offers: g.offers }; });
const waitStage = async (stage, ms = 60000) => { await page.waitForFunction((s) => window.__gate?.store.getState().stage === s, stage, { timeout: ms }); note(`stage → ${stage}`); };
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); note(`shot ${name}`); };
const hear = async (text) => { note(`person says: ${text}`); await page.evaluate((t) => window.__gate.flow.testHear(t), text); };
const waitSaid = async (pred, ms = 30000) => { await page.waitForFunction((p) => { const t = window.__gate.store.getState().companionLine?.text ?? ''; return new RegExp(p, 'i').test(t); }, pred, { timeout: ms }); const s = await state(); note(`companion: ${s.said}`); };

try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  await shot('01-portal');
  await page.getByTestId('begin').click();
  note('tapped Begin');
  await waitStage('greeting', 10000);
  await page.waitForTimeout(2200);
  await shot('02-greeting');
  await waitStage('gathering', 40000);
  await page.waitForTimeout(1500);
  await shot('03-gathering');
  note(`state: ${JSON.stringify(await state())}`);
  if (photo) {
    note(`shares a photo: ${photo}`);
    await page.getByTestId('photo-input').setInputFiles(photo);
    await waitSaid('where is this place', 45000);
    await page.waitForTimeout(1500);
    await shot('03b-photo');
  }
  await hear(photo ? 'It was my aunt’s living room. We sat there every Sunday afternoon.' : words);
  await waitSaid('.', 30000);
  await page.waitForTimeout(2500);
  await shot('04-described');
  const afterDescribe = await state();
  if (afterDescribe.stage === 'gathering') {
    await page.waitForTimeout(3000);
    await hear('Yes, let’s go there.');
  }
  await waitStage('entering', 40000);
  await page.waitForTimeout(2600);
  await shot('05-entering');
  await waitStage('forming', 20000);
  await page.waitForTimeout(2500);
  await shot('06-forming');
  await waitStage('memory', 60000);
  await page.waitForTimeout(4000);
  await shot('07-memory');
  note(`state: ${JSON.stringify(await state())}`);
  await page.waitForTimeout(6000);
  await hear('There was a little cat sleeping on one of the chairs.');
  await page.waitForTimeout(9000);
  await shot('08-detail');
  await page.getByTestId('leave').click();
  note('tapped Leave');
  await waitStage('album', 40000);
  await page.waitForTimeout(3500);
  await shot('09-album');
  // Visit again: open the first moment, choose "Visit again", and come back into the same place.
  const pane = page.locator('[data-testid=moment]').first();
  if (mobile) await pane.tap(); else await pane.hover();
  await page.waitForTimeout(1200);
  const revisit = page.getByTestId('moment-revisit').first();
  if (await revisit.isVisible().catch(() => false)) {
    await revisit.click();
    note('tapped Visit again');
    await waitStage('memory', 40000);
    await page.waitForTimeout(3000);
    await shot('10-revisited');
    note(`revisited: ${JSON.stringify(await state())}`);
    await page.getByTestId('leave').click();
    await waitStage('album', 40000);
  } else note('Visit again button not visible');
  const albumInfo = await page.evaluate(() => window.__gate.store.getState().stage);
  note(`final stage: ${albumInfo}`);
} catch (e) {
  note(`FAILED: ${String(e).slice(0, 400)}`);
  await shot('zz-failure').catch(() => undefined);
  note(`state: ${JSON.stringify(await state().catch(() => null))}`);
}
note(`errors: ${errors.length}`);
for (const e of errors.slice(0, 20)) note(`  ${e}`);
writeFileSync(`${out}/log.txt`, log.join('\n') + '\n');
await browser.close();
