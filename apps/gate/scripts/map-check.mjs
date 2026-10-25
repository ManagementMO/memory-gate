// The memory map, end to end in a browser: start page → map → San Francisco (your album) → back → World memories →
// San Francisco (other people's albums) and New York (clouded, no words) → make a memory public → it appears under
// "You" → reload → still public. Screenshots on a laptop and a phone.
//   node apps/gate/scripts/map-check.mjs [outPrefix]   (needs the gate dev server on https://localhost:5180)
import { chromium } from '@playwright/test';

const prefix = process.argv[2] ?? 'apps/gate/.shots/map';
const base = 'https://localhost:5180';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader'] });
const errors = [];
const results = {};
const check = (name, ok) => { results[name] = ok; if (!ok) console.error(`✗ ${name}`); };

async function page(viewport) {
  const p = await (await browser.newContext({ viewport, ignoreHTTPSErrors: true })).newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|ERR_CONNECTION|exchange/i.test(m.text())) errors.push(m.text()); });
  return p;
}
// The pointer is moved off the page after each click: a mouse resting over a pane opens it (hover), which a phone never does.
const settle = async (p, ms = 1400) => { await p.mouse.move(1, 1); await p.waitForTimeout(ms); };

// 1. The preview (no backend): the map, both tabs, both places, and the public/private choice.
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 375, height: 812 }]]) {
  const p = await page(viewport);
  await p.goto(`${base}/?preview=album&map=1`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=map]', { timeout: 30000 });
  await settle(p, 2600);
  await p.screenshot({ path: `${prefix}-${label}-mine.png` });
  check(`${label}: My memories shows only San Francisco`, (await p.locator('[data-testid^=map-place-]').count()) === 1 && (await p.locator('[data-testid=map-place-sf]').count()) === 1);
  check(`${label}: no horizontal scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await p.click('[data-testid=map-tab-world]');
  await settle(p);
  await p.screenshot({ path: `${prefix}-${label}-world.png` });
  check(`${label}: World memories shows San Francisco and New York`, (await p.locator('[data-testid=map-place-ny][data-locked=true]').count()) === 1 && (await p.locator('[data-testid=map-place-sf]').count()) === 1);

  await p.click('[data-testid=map-place-ny]');
  await p.waitForSelector('[data-testid=locked-place]');
  await settle(p, 2200);
  await p.screenshot({ path: `${prefix}-${label}-new-york.png` });
  const nyText = await p.locator('[data-testid=locked-place]').innerText();
  check(`${label}: New York is clouded, four memories with a "?"`, (await p.locator('[data-testid=clouded]').count()) === 4 && nyText.includes('?'));
  check(`${label}: New York shows no words from its memories`, !/rowboat|oranges|lemonade|fireflies|radio/i.test(nyText));
  await p.click('[data-testid=album-back]');
  await p.waitForSelector('[data-testid=map]');

  await p.click('[data-testid=map-place-sf]');
  await p.waitForSelector('[data-testid=world-album]');
  await settle(p, 2200);
  await p.screenshot({ path: `${prefix}-${label}-world-sf.png` });
  check(`${label}: World San Francisco shows three people's albums`, (await p.locator('[data-testid=world-person]').count()) === 3);
  await p.click('[data-testid=album-back]');

  await p.click('[data-testid=map-tab-mine]');
  await p.click('[data-testid=map-place-sf]');
  await p.waitForSelector('[data-testid=album]');
  await settle(p, 2200);
  check(`${label}: your album says San Francisco`, (await p.locator('[data-testid=album-place]').innerText()).toLowerCase().includes('san francisco'));
  check(`${label}: each of your memories has Private/Public, Private first`, (await p.locator('[data-testid=visibility]').count()) === 3 && (await p.locator('[data-testid=visibility][data-value=private]').count()) === 3);
  if (label === 'desktop') {
    await p.locator('[data-testid=visibility]').first().locator('label:has([data-testid=visibility-public])').click();
    await settle(p, 500);
    check('desktop: choosing Public is shown', (await p.locator('[data-testid=visibility]').first().getAttribute('data-value')) === 'public');
    await p.locator('[data-testid=visibility]').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${prefix}-${label}-visibility.png` });
    await p.click('[data-testid=album-back]');
    await p.click('[data-testid=map-tab-world]');
    check('desktop: the SF pin counts your public memory', (await p.locator('[data-testid=map-place-sf]').innerText()).includes('4 memories'));
    await p.click('[data-testid=map-place-sf]');
    await p.waitForSelector('[data-testid=world-album]');
    check('desktop: your public memory appears under "You"', (await p.locator('[data-testid=world-person]').count()) === 4 && (await p.locator('[data-testid=world-person]').first().innerText()).includes('Your public memories'));
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-testid=map]', { timeout: 30000 });
    await p.click('[data-testid=map-tab-world]');
    await p.click('[data-testid=map-place-sf]');
    await p.waitForSelector('[data-testid=world-album]');
    check('desktop: still public after a reload', (await p.locator('[data-testid=world-person]').first().innerText()).includes('Your public memories'));
  }
  await p.context().close();
}

// 2. The real start page: the map button replaces the album button, opens the map, and × comes back.
{
  const p = await page({ width: 1440, height: 900 });
  await p.goto(`${base}/?mode=offline`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=open-map]', { timeout: 30000 });
  check('start page: the map button is there, the old album button is not', (await p.locator('[data-testid=open-album]').count()) === 0);
  await settle(p, 2500);
  await p.screenshot({ path: `${prefix}-start.png` });
  await p.click('[data-testid=open-map]');
  await p.waitForSelector('[data-testid=map]');
  await settle(p, 2500);
  await p.screenshot({ path: `${prefix}-from-start.png` });
  await p.click('[data-testid=map-place-sf]');
  await p.waitForSelector('[data-testid=album]');
  check('start page: San Francisco opens your album', (await p.locator('[data-testid=album-samples]').count()) === 1);
  await p.click('[data-testid=album-back]');
  await p.click('[data-testid=map-close]');
  await p.waitForSelector('[data-testid=open-map]');
  check('start page: × goes back to the start', true);
  // Leaving a visit opens the album on San Francisco (not the map), where the moment just kept is.
  await p.evaluate(() => { const g = window.__gate; g.store.getState().set({ stage: 'memory' }); return g.flow.leave(); });
  await p.waitForSelector('[data-testid=album]', { timeout: 20000 });
  check('after a visit: the album opens on San Francisco with the way back to the map', (await p.locator('[data-testid=album-place]').count()) === 1 && (await p.locator('[data-testid=album-back]').count()) === 1);
  await p.click('[data-testid=album-back]');
  await p.waitForSelector('[data-testid=map]');
  await p.context().close();
}

await browser.close();
const failed = Object.entries(results).filter(([, ok]) => !ok);
console.log(JSON.stringify({ passed: Object.keys(results).length - failed.length, failed: failed.map(([n]) => n), errors }, null, 2));
process.exit(failed.length || errors.length ? 1 : 0);
