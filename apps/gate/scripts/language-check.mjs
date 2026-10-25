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
  ctx.setDefaultTimeout(15_000);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  pageerror: ${String(e).slice(0, 200)}`));
  // The perspective chooser opens on flat screens during a visit; these checks look without choosing.
  await page.addLocatorHandler(page.getByTestId('perspective-picker'), async () => { await page.getByText('Just look for now').click(); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  return { ctx, page };
}

/** Open the gear, pick a language, close the panel. */
async function choose(page, setting) {
  await page.getByTestId('open-settings').click();
  await page.locator(`label:has([data-testid=language-${setting}])`).click();
  await page.getByTestId('settings-done').click();
}

const stored = (page) => page.evaluate(() => localStorage.getItem('mg.gate.language'));

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
} catch (e) {
  check('the checks ran to the end', false, String(e?.message ?? e).split('\n')[0].slice(0, 200));
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
