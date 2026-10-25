// The companion's languages, checked in a real browser. Free: an offline room (paid services forced off by the
// server) and no voice engine; the person's words are delivered through the page's test hook, like flow.mjs.
// Run it against a Gate dev server, e.g. a worktree's own on another port:
//   CONVEX_PROXY_TARGET=http://127.0.0.1:3212 GATE_PORT=5190 npm --prefix apps/gate run dev
//   node apps/gate/scripts/language-check.mjs [--base https://localhost:5190]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'https://localhost:5190');
const url = `${base}/?voice=off&mode=offline`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

/** A fresh device: its own storage, the start page loaded. */
async function device() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  ctx.setDefaultTimeout(30_000);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  pageerror: ${String(e).slice(0, 200)}`));
  // The perspective chooser opens on flat screens during a visit; these checks look without choosing.
  await page.addLocatorHandler(page.getByTestId('perspective-picker'), async () => { await page.getByText('Just look for now').click(); });
  await page.goto(url, { waitUntil: 'load' });
  // A busy machine can take a while to draw the start page: wait for it rather than a fixed time.
  await page.getByTestId('open-settings').waitFor({ timeout: 90_000 });
  await page.waitForFunction(() => !!window.__gate, null, { timeout: 30_000 });
  return { ctx, page };
}

/** Open the gear, pick a language, close the panel. */
async function choose(page, setting) {
  await page.getByTestId('open-settings').click();
  await page.locator(`label:has([data-testid=language-${setting}])`).click();
  await page.getByTestId('settings-done').click();
}

const stored = (page) => page.evaluate(() => localStorage.getItem('mg.gate.language'));

/** Keep every line the companion says, page-side, as it happens. */
const recordLines = (page) => page.evaluate(() => {
  window.__lines = [];
  let last = null;
  window.__gate.store.subscribe((s) => { const l = s.companionLine; if (l && l.id !== last) { last = l.id; window.__lines.push(l.text); } });
});
const lines = (page) => page.evaluate(() => window.__lines.slice());
const waitLine = (page, re, ms = 40_000) => page.waitForFunction((src) => window.__lines.some((t) => new RegExp(src, 'i').test(t)), re.source, { timeout: ms });
const waitStage = (page, stage, ms = 60_000) => page.waitForFunction((s) => window.__gate?.store.getState().stage === s, stage, { timeout: ms });
const hear = (page, text) => page.evaluate((t) => window.__gate.flow.testHear(t), text);
/** The next line said after `count` lines (waits for it). */
async function nextLine(page, count, ms = 30_000) {
  await page.waitForFunction((n) => window.__lines.length > n, count, { timeout: ms });
  return (await lines(page))[count];
}
// Words that only an English line would have (the Spanish and French lines never use them).
const ENGLISH = /\b(the|you|your|here we are|thank you|hello|shall we)\b/i;

try {
  // ---------------------------------------------------------------- the setting itself
  {
    const { ctx, page } = await device();
    await choose(page, 'es');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
    check('the choice is kept on this device', (await stored(page)) === 'es');
    await page.getByTestId('open-settings').click();
    check('reopening the gear shows Español chosen', await page.getByTestId('language-es').isChecked());
    await page.locator('label:has([data-testid=language-auto])').click();
    await page.getByTestId('settings-done').click();
    check('Automatic can be chosen again', (await stored(page)) === 'auto');
    await ctx.close();
  }

  // ---------------------------------------------------------------- a visit with Spanish pinned
  {
    const { ctx, page } = await device();
    await choose(page, 'es');
    await recordLines(page);
    await page.getByTestId('begin').click();
    await waitLine(page, /Hola/);
    check('Spanish: the greeting is Spanish', true);
    await waitLine(page, /momento/);
    await waitStage(page, 'gathering');
    let n = (await lines(page)).length;
    await hear(page, 'La casa de mi abuela tenía una cocina grande con cortinas amarillas y una mesa de madera');
    const reply = await nextLine(page, n);
    check('Spanish: a description gets a Spanish reply', /Ya casi puedo verlo|Suena precioso|Cuénteme|Me encantaría/.test(reply), reply);
    await hear(page, 'Sí, vamos');
    await waitStage(page, 'memory');
    try { await waitLine(page, /Aquí estamos/, 20_000); check('Spanish: the place is introduced in Spanish', true); }
    catch { check('Spanish: the place is introduced in Spanish', false, (await lines(page)).slice(-3).join(' | ')); }
    n = (await lines(page)).length;
    await hear(page, 'Quiero irme');
    await waitStage(page, 'album', 30_000);
    check('Spanish: "Quiero irme" leaves, thanked in Spanish', (await lines(page)).slice(n).some((t) => /Gracias por llevarme/.test(t)));
    const english = (await lines(page)).filter((t) => ENGLISH.test(t));
    check('Spanish: no English line during the visit', english.length === 0, english.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- English, word for word as before (Automatic, an English device)
  {
    const { ctx, page } = await device();
    await recordLines(page);
    await page.getByTestId('begin').click();
    await waitLine(page, /^Hello\. I’m so glad you’re here\.$/);
    await waitLine(page, /^Is there a moment you’d like to visit today\? You can tell me about it, or show me a photo\.$/);
    check('English: the greeting is today’s', true);
    await waitStage(page, 'gathering');
    let n = (await lines(page)).length;
    await hear(page, 'My grandmother’s kitchen, in the morning. Yellow curtains on the window, a round wooden table with two chairs, and her radio on the counter.');
    const reply = await nextLine(page, n);
    check('English: a description gets today’s reply', /^I can almost see .*Shall we go there together\?$/.test(reply), reply);
    await hear(page, 'Yes, let’s go there.');
    await waitStage(page, 'memory');
    try { await waitLine(page, /^Tell me what else was here, or anything you notice\. Say when you’d like to leave\.$/, 20_000); check('English: the memory opens with today’s words', true); }
    catch { check('English: the memory opens with today’s words', false, (await lines(page)).slice(-3).join(' | ')); }
    n = (await lines(page)).length;
    await hear(page, 'I’d like to leave now');
    await waitStage(page, 'album', 30_000);
    check('English: leaving is thanked as before', (await lines(page)).slice(n).includes('Thank you for taking me there. I’ve kept this moment for you.'));
    const other = (await lines(page)).filter((t) => /[¿¡]|Aquí|Nous y voilà|Hola|Bonjour/.test(t));
    check('English: no Spanish or French line', other.length === 0, other.join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- Automatic follows a French speaker
  {
    const { ctx, page } = await device();
    await recordLines(page);
    await page.getByTestId('begin').click();
    await waitLine(page, /Hello/);
    check('Automatic: the greeting is in the device’s language (English)', true);
    await waitStage(page, 'gathering');
    const n = (await lines(page)).length;
    await hear(page, 'La maison de ma grand-mère avait une grande cuisine avec des rideaux jaunes et une table en bois');
    const reply = await nextLine(page, n);
    check('Automatic: French words get a French reply', /Je le vois presque|Ça a l’air|Dites-moi|J’aimerais/.test(reply), reply);
    await ctx.close();
  }
} catch (e) {
  check('the checks ran to the end', false, String(e?.message ?? e).split('\n')[0].slice(0, 200));
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
