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
  check(`${label}: World San Francisco shows the proposal first, then three people's albums`, (await p.locator('[data-testid=world-person]').count()) === 4 && (await p.locator('[data-testid=world-person]').first().innerText()).includes('The proposal on the hill'));
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
    check('desktop: the SF pin counts your public memory', (await p.locator('[data-testid=map-place-sf]').innerText()).includes('5 memories'));
    await p.click('[data-testid=map-place-sf]');
    await p.waitForSelector('[data-testid=world-album]');
    check('desktop: your public memory appears under "You", after the showcase', (await p.locator('[data-testid=world-person]').count()) === 5 && (await p.locator('[data-testid=world-person]').nth(1).innerText()).includes('Your public memories'));
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-testid=map]', { timeout: 30000 });
    await p.click('[data-testid=map-tab-world]');
    await p.click('[data-testid=map-place-sf]');
    await p.waitForSelector('[data-testid=world-album]');
    check('desktop: still public after a reload', (await p.locator('[data-testid=world-person]').nth(1).innerText()).includes('Your public memories'));
  }
  await p.context().close();
}

// 2. Zoom mode: + and −, scroll, drag, the whole world again, Escape; tapping the map zooms toward the tap; a pin
//    opens its place from there; and on a phone, a real two-finger pinch.
const zoomOf = async (p) => Number(await p.getAttribute('[data-testid=map-zoom-stage]', 'data-zoom'));
const viewBoxOf = (p) => p.getAttribute('[data-testid=map-zoom-stage] svg', 'viewBox');
{
  const p = await page({ width: 1440, height: 900 });
  await p.goto(`${base}/?preview=album&map=1`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=map]', { timeout: 30000 });
  await p.click('[data-testid=map-zoom]');
  await p.waitForSelector('[data-testid=map-zoomed]');
  await settle(p, 700);
  check('zoom: opens on the whole world', (await zoomOf(p)) === 1);
  check('zoom: the map has keyboard focus', await p.evaluate(() => document.activeElement?.dataset.testid === 'map-zoom-stage'));
  await p.click('[data-testid=map-zoom-in]');
  await settle(p, 700);
  check('zoom: + doubles', Math.abs((await zoomOf(p)) - 2) < 0.01);
  const box = await p.locator('[data-testid=map-zoom-stage]').boundingBox();
  await p.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await p.mouse.wheel(0, -400);
  await p.waitForTimeout(300);
  check('zoom: scrolling zooms in further', (await zoomOf(p)) > 2.5);
  const before = await viewBoxOf(p);
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2 + 90, { steps: 8 });
  await p.mouse.up();
  check('zoom: dragging moves the map', (await viewBoxOf(p)) !== before);
  await p.keyboard.press('-');
  await settle(p, 700);
  await p.screenshot({ path: `${prefix}-desktop-zoomed.png` });
  await p.click('[data-testid=map-zoom-world]');
  await settle(p, 700);
  check('zoom: the globe shows the whole world again', (await zoomOf(p)) === 1);
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid=map-zoomed]', { state: 'detached' });
  check('zoom: Escape goes back, focus on Zoom', await p.evaluate(() => document.activeElement?.dataset.testid === 'map-zoom'));

  // Tap the small map just beside San Francisco: zoom mode glides in toward it, and the pin opens the album.
  const mapBox = await p.locator('[data-testid=map-box]').boundingBox();
  const sf = await p.locator('[data-testid=map-pin-sf]').boundingBox();
  await p.mouse.click(sf.x + sf.width / 2 + 30, Math.min(mapBox.y + mapBox.height - 4, sf.y + sf.height + 30));
  await p.waitForSelector('[data-testid=map-zoomed]');
  await settle(p, 900);
  check('zoom: tapping the map zooms toward the tap', Math.abs((await zoomOf(p)) - 3) < 0.01);
  const pin = await p.locator('[data-testid=zoom-pin-sf]').boundingBox();
  const stage = await p.locator('[data-testid=map-zoom-stage]').boundingBox();
  check('zoom: San Francisco is in view, near where it was tapped', !!pin && pin.x > stage.x && pin.x < stage.x + stage.width * 0.6);
  check('zoom: names show beside the pins', await p.locator('[data-testid=zoom-pin-sf] .worldmap-pin-label').isVisible());
  await p.screenshot({ path: `${prefix}-desktop-zoom-tap.png` });
  await p.click('[data-testid=zoom-pin-sf]');
  await p.waitForSelector('[data-testid=album]');
  check('zoom: a pin opens its place', (await p.locator('[data-testid=map-zoomed]').count()) === 0);
  await p.context().close();
}
{
  const p = await (await browser.newContext({ viewport: { width: 375, height: 812 }, ignoreHTTPSErrors: true, hasTouch: true, isMobile: true })).newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(`${base}/?preview=album&map=1`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=map]', { timeout: 30000 });
  await p.click('[data-testid=map-tab-world]');
  await p.tap('[data-testid=map-zoom]');
  await p.waitForSelector('[data-testid=map-zoomed]');
  await p.waitForTimeout(700);
  const s = await p.locator('[data-testid=map-zoom-stage]').boundingBox();
  const cx = s.x + s.width * 0.3, cy = s.y + s.height / 2;
  const cdp = await p.context().newCDPSession(p);
  const touch = (type, spread) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }] });
  await touch('touchStart', 20);
  for (let i = 1; i <= 12; i++) await touch('touchMove', 20 + i * 8);
  await touch('touchEnd', 0);
  await p.waitForTimeout(300);
  const pinched = await zoomOf(p);
  check(`phone zoom: a two-finger pinch zooms in (to ${pinched.toFixed(1)}×)`, pinched > 3);
  check('phone zoom: no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: `${prefix}-phone-zoomed.png` });
  await p.tap('[data-testid=map-zoom-done]');
  await p.waitForSelector('[data-testid=map-zoomed]', { state: 'detached' });
  await p.context().close();
}

// 3. The showcase: World memories → San Francisco → the proposal → Step into it → the meadow with the couple, walking
//    around them, and the way back lands on World memories → San Francisco again. Then the page on a phone.
{
  const p = await page({ width: 1440, height: 900 });
  await p.goto(`${base}/?mode=offline`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=open-map]', { timeout: 30000 });
  await p.click('[data-testid=open-map]');
  await p.click('[data-testid=map-tab-world]');
  await p.click('[data-testid=map-place-sf]');
  await p.waitForSelector('[data-testid=world-album]');
  await settle(p, 2200);
  const showcase = p.locator('[data-testid=world-person]').first();
  await showcase.locator('.pane-hit').first().click();
  await p.waitForSelector('[data-testid=moment-revisit]');
  check('showcase: the proposal offers Step into it', (await p.locator('[data-testid=moment-revisit]').first().innerText()).includes('Step into it'));
  await p.screenshot({ path: `${prefix}-desktop-showcase.png` });
  await p.locator('[data-testid=moment-revisit]').first().click();
  await p.waitForURL(/story=proposal/);
  await p.waitForFunction(() => window.__proposal?.ready(), null, { timeout: 120000 });
  await p.waitForTimeout(2500);
  const couple = await p.evaluate(() => window.__proposal.couple());
  check('showcase: the couple stands in the clearing, on the ground', !!couple && Math.abs(couple[1]) < 0.3 && couple[2] < -2);
  check('showcase: their words are there', (await p.locator('[data-testid=proposal-quote]').innerText()).includes('ring'));
  await p.screenshot({ path: `${prefix}-desktop-proposal.png` });
  const before = await p.evaluate(() => window.__proposal.camera());
  await p.locator('canvas').first().click({ position: { x: 700, y: 300 } });
  await p.keyboard.down('KeyW'); await p.waitForTimeout(1200); await p.keyboard.up('KeyW');
  const after = await p.evaluate(() => window.__proposal.camera());
  check('showcase: you can walk toward them', Math.hypot(after[0] - before[0], after[2] - before[2]) > 0.8);
  await p.click('[data-testid=proposal-next]');
  check('showcase: Next shows Sofia\'s words', (await p.locator('[data-testid=proposal-quote]').innerText()).includes('walk'));
  await p.click('[data-testid=proposal-back]');
  await p.waitForSelector('[data-testid=world-album]', { timeout: 30000 });
  check('showcase: back lands on World memories → San Francisco', (await p.locator('[data-testid=world-person]').first().innerText()).includes('The proposal on the hill'));
  await p.context().close();

  const phone = await (await browser.newContext({ viewport: { width: 375, height: 812 }, ignoreHTTPSErrors: true, hasTouch: true, isMobile: true })).newPage();
  phone.on('pageerror', (e) => errors.push(String(e)));
  await phone.goto(`${base}/?story=proposal`, { waitUntil: 'load' });
  await phone.waitForFunction(() => window.__proposal?.ready(), null, { timeout: 120000 });
  await phone.waitForTimeout(2500);
  check('showcase phone: opens, no horizontal scroll', await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.screenshot({ path: `${prefix}-phone-proposal.png` });
  await phone.context().close();
}

// 4. The real start page: the map button replaces the album button, opens the map, and × comes back.
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
  // Back from the Red Kite's own page, opened from the album (prepared.ts openPrepared): the album again, not the map.
  await p.evaluate(() => sessionStorage.setItem('mg.return-to', 'album'));
  await p.goto(`${base}/?mode=offline`, { waitUntil: 'load' });
  await p.waitForSelector('[data-testid=album]', { timeout: 30000 });
  check('back from the Red Kite: the San Francisco album again', (await p.locator('[data-testid=album-place]').count()) === 1 && (await p.locator('[data-testid=map]').count()) === 0);
  await p.context().close();
}

await browser.close();
const failed = Object.entries(results).filter(([, ok]) => !ok);
console.log(JSON.stringify({ passed: Object.keys(results).length - failed.length, failed: failed.map(([n]) => n), errors }, null, 2));
process.exit(failed.length || errors.length ? 1 : 0);
