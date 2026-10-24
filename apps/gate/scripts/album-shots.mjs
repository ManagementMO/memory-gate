// Album review shots: rest state, a hovered (opened) moment, keyboard focus, and phone with a tapped moment.
//   node apps/gate/scripts/album-shots.mjs <outPrefix>
import { chromium } from '@playwright/test';
const prefix = process.argv[2] ?? 'apps/gate/.shots/album';
const url = 'https://localhost:5180/?preview=album';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader'] });
const ready = async (page) => { await page.goto(url, { waitUntil: 'load' }); await page.waitForSelector('[data-testid=moment]', { timeout: 30000 }); await page.waitForTimeout(3500); };
const errors = [];

const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })).newPage();
desk.on('pageerror', (e) => errors.push(String(e)));
await ready(desk);
await desk.screenshot({ path: `${prefix}-desktop.png` });
const panes = desk.locator('[data-testid=moment]');
const box = await panes.nth(1).boundingBox();
await desk.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
await desk.waitForTimeout(1600);
await desk.screenshot({ path: `${prefix}-hover.png` });
// move across to the next pane: the open moment should follow without flicker
const box2 = await panes.nth(2).boundingBox();
await desk.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 });
await desk.waitForTimeout(1600);
await desk.screenshot({ path: `${prefix}-hover-next.png` });
const openCount = await desk.locator('[data-testid=moment][data-open=true]').count();
await desk.mouse.move(5, 5);
await desk.waitForTimeout(1200);
const closedAfterLeave = await desk.locator('[data-testid=moment][data-open=true]').count();
// keyboard: Tab to the second memory's first moment
await desk.keyboard.press('Tab');
await desk.keyboard.press('Tab');
await desk.waitForTimeout(1200);
await desk.screenshot({ path: `${prefix}-focus.png` });
await desk.keyboard.press('Escape');
await desk.waitForTimeout(800);
const afterEsc = await desk.locator('[data-testid=moment][data-open=true]').count();
// scroll to the kitchen memory (source photo inset) and open its arrival
await desk.locator('[data-testid=memory]').nth(1).scrollIntoViewIfNeeded();
await desk.waitForTimeout(800);
const kb = await desk.locator('[data-testid=memory]').nth(1).locator('[data-testid=moment]').nth(0).boundingBox();
await desk.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2, { steps: 6 });
await desk.waitForTimeout(1600);
await desk.screenshot({ path: `${prefix}-kitchen-open.png` });

const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })).newPage();
phone.on('pageerror', (e) => errors.push(String(e)));
await ready(phone);
await phone.screenshot({ path: `${prefix}-phone.png` });
await phone.locator('[data-testid=moment]').nth(1).locator('.pane-hit').tap();
await phone.waitForTimeout(1600);
await phone.screenshot({ path: `${prefix}-phone-open.png` });
const phoneOpen = await phone.locator('[data-testid=moment][data-open=true]').count();

const empty = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })).newPage();
await empty.goto(url + '&empty=1', { waitUntil: 'load' });
await empty.waitForSelector('[data-testid=album-empty]', { timeout: 30000 });
await empty.waitForTimeout(3000);
await empty.screenshot({ path: `${prefix}-empty.png` });

console.log(JSON.stringify({ openWhileHovering: openCount, openAfterLeave: closedAfterLeave, openAfterEsc: afterEsc, phoneOpenAfterTap: phoneOpen, errors }, null, 0));
await browser.close();
