// States everywhere: missing consent, a dropped connection, "Reset demo room", and "Delete this memory" as seen from a
// second phone. Uses only library objects (no generation cost).
import { expect, test } from '@playwright/test';
import { createRoomWithConsent, deleteOwnedRoom, IPHONE_13, objectItem, overflowsX, shot } from './helpers.mjs';

test('missing consent: the typed line and the photo upload explain what is needed', async ({ browser }) => {
  const ctx = await browser.newContext({ ...IPHONE_13 });
  const page = await ctx.newPage();
  await createRoomWithConsent(page, {
    title: 'E2E: no voice consent', name: 'Karen (test)',
    scopes: { photo_processing: false, voice_processing: false, vendor_upload_modal: false, vendor_upload_worldlabs: false },
  });
  await page.getByTestId('tab-story').click();
  await expect(page.getByTestId('tell-needs-consent')).toBeVisible();
  await expect(page.getByTestId('tell-input')).toBeDisabled();
  await page.getByTestId('tab-photo').click();
  await expect(page.getByTestId('photo-needs-consent')).toBeVisible();
  await shot(page, 'consent-missing');
  await deleteOwnedRoom(page);
  await ctx.close();
});

test('a dropped connection shows a calm banner, queues the tap, and recovers', async ({ browser }) => {
  const ctx = await browser.newContext({ ...IPHONE_13 });
  const page = await ctx.newPage();
  let blocked = false;
  const open = [];
  await page.routeWebSocket(/\/api\/[^/]+\/sync/, (ws) => {
    if (blocked) { ws.close({ code: 1011, reason: 'test: network down' }); return; }
    ws.connectToServer();
    open.push(ws);
  });
  await createRoomWithConsent(page, { title: 'E2E: flaky Wi-Fi', name: 'Karen (test)', scopes: { vendor_upload_modal: false, vendor_upload_worldlabs: false } });
  await page.getByTestId('tab-story').click();
  await expect(page.getByTestId('objects-empty')).toBeVisible();
  await expect(page.getByTestId('timeline-empty')).toBeVisible();
  await expect(page.getByTestId('disconnected')).toHaveCount(0);

  blocked = true;
  for (const ws of open.splice(0)) await ws.close({ code: 1011, reason: 'test: network down' });
  await expect(page.getByTestId('disconnected')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('disconnected')).toContainText('Reconnecting');
  await page.getByTestId('add-object-input').fill('radio');
  await page.getByTestId('add-object-submit').click(); // queued by the Convex client while offline
  await shot(page, 'disconnected');

  blocked = false;
  await expect(page.getByTestId('disconnected')).toHaveCount(0, { timeout: 40_000 });
  await expect(objectItem(page, 'radio').getByTestId('object-status')).toHaveText('Suggested', { timeout: 20_000 });
  await deleteOwnedRoom(page);
  await ctx.close();
});

test('reset demo room clears both phones; delete this memory ends the room everywhere', async ({ browser }) => {
  const ctxA = await browser.newContext({ ...IPHONE_13 });
  const ctxB = await browser.newContext({ viewport: { width: 1024, height: 800 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const code = await createRoomWithConsent(a, { title: 'E2E: reset and delete', name: 'Karen (test)', scopes: { vendor_upload_modal: false, vendor_upload_worldlabs: false } });
  await a.getByTestId('tab-story').click();
  await b.goto(`/?room=${code}`);
  await expect(b.getByTestId('join-code')).toHaveValue(code ?? ''); // the family link pre-fills the code
  await b.getByTestId('join-name').fill('Viewer (test)');
  await b.getByTestId('join-role-viewer').check();
  await b.getByTestId('join-submit').click();
  await expect(b.getByTestId('live-screen')).toBeVisible();

  await a.getByTestId('add-object-input').fill('armchair');
  await a.getByTestId('add-object-submit').click();
  await expect(objectItem(b, 'armchair')).toBeVisible();
  await expect(objectItem(b, 'armchair').getByTestId('object-confirm')).toHaveCount(0); // a viewer can't confirm
  await expect(b.getByTestId('pause-toggle')).toHaveCount(0);

  await a.getByTestId('admin-open').click();
  await a.getByTestId('reset-demo').click();
  await a.getByTestId('reset-confirm').click();
  await a.getByTestId('admin-back').click();
  await expect(a.getByTestId('objects-empty')).toBeVisible();
  await expect(b.getByTestId('objects-empty')).toBeVisible();

  await a.getByTestId('admin-open').click();
  await a.getByTestId('delete-code-input').fill('WRONG1');
  await expect(a.getByTestId('delete-confirm')).toBeDisabled();
  await a.getByTestId('delete-code-input').fill(code ?? '');
  await a.getByTestId('delete-confirm').click();
  await expect(a.getByTestId('welcome-notice')).toContainText('This memory was deleted');
  await expect(b.getByTestId('room-gone')).toBeVisible();
  await shot(b, 'room-gone');
  await b.getByTestId('room-gone-leave').click();
  await expect(b.getByTestId('welcome')).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test('every screen fits a 360 px phone without sideways scrolling', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByTestId('welcome')).toBeVisible();
  expect(await overflowsX(page), 'welcome').toBe(false);
  await createRoomWithConsent(page, { title: 'E2E: a very long room title for the narrowest phone we support', name: 'Karen (test)', scopes: { vendor_upload_modal: false, vendor_upload_worldlabs: false } });
  expect(await overflowsX(page), 'consent').toBe(false);
  await page.getByTestId('tab-photo').click();
  await page.getByTestId('photo-use-sample').click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  expect(await overflowsX(page), 'photo').toBe(false);
  await page.getByTestId('tab-story').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  const microphone = await page.getByTestId('voice-enable').boundingBox();
  expect(microphone, 'the storyteller can begin without scrolling').not.toBeNull();
  expect(microphone.y).toBeGreaterThanOrEqual(0);
  expect(microphone.y + microphone.height).toBeLessThanOrEqual(740);
  await page.getByTestId('add-object-input').fill('bowl of oranges');
  await page.getByTestId('add-object-submit').click();
  await expect(objectItem(page, 'bowl of oranges')).toBeVisible();
  expect(await overflowsX(page), 'story').toBe(false);
  await shot(page, 'live-360');
  await page.getByTestId('admin-open').click();
  await expect(page.getByTestId('admin-screen')).toBeVisible();
  expect(await overflowsX(page), 'admin').toBe(false);
  await deleteOwnedRoom(page);
  await ctx.close();
});
