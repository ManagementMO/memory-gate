// (1) The phone page opened on the computer's LAN address (as a real phone on the Wi-Fi would) loads live data through
// the dev server's /api proxy and plays a recorded clip from a rewritten storage URL. (2) The photo pipeline on the
// phone: canvas-normalized sample photo -> upload -> addPhoto -> the sample room fallback (no GPU consent given).
import { expect, test } from '@playwright/test';
import { backend, createRoomWithConsent, deleteOwnedRoom, IPHONE_13, lanIp, objectItem, shot, wav } from './helpers.mjs';

const ip = lanIp();

test.describe('phone on the Wi-Fi (LAN address)', () => {
  test.skip(!ip, 'no LAN IPv4 address on this machine');

  test('loads live data via the proxy and replays a recorded clip from a storage URL', async ({ browser }) => {
    const origin = `http://${ip}:5173`;
    const ctx = await browser.newContext({ ...IPHONE_13, baseURL: origin });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const sockets = [];
    page.on('websocket', (ws) => sockets.push(ws.url()));

    const code = await createRoomWithConsent(page, {
      title: 'E2E: on the Wi-Fi', name: 'Karen (test)',
      scopes: { voice_recording: true, vendor_upload_modal: false, vendor_upload_worldlabs: false },
    });
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false); // plain http on the LAN, like a real phone
    expect(sockets.some((u) => u.startsWith(`ws://${ip}:5173/api/`))).toBe(true); // Convex sync goes through the proxy

    // The headset joins from "the Quest" and sends a recorded line (stored clip, voice_recording consent given).
    const { client, api } = backend();
    await page.getByTestId('tab-story').click(); // the family key is shown with the headset link on the story screen
    const familyKey = ((await page.getByTestId('family-key').locator('strong').textContent()) ?? '').trim();
    const head = await client.mutation(api.rooms.join, { code, displayName: 'Grandma (sample)', role: 'storyteller', key: familyKey });
    const uploadUrl = await client.mutation(api.utterances.generateAudioUploadUrl, { code, token: head.token });
    const up = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav() });
    expect(up.ok).toBe(true);
    const { storageId } = await up.json();
    await client.mutation(api.utterances.add, {
      code, token: head.token, transcript: 'We kept a radio on the shelf by the door.', source: 'stt', durationMs: 800, audioFileId: storageId, commandId: crypto.randomUUID(),
    });

    await page.getByTestId('tab-story').click();
    const line = page.getByTestId('utterance-item').filter({ hasText: 'We kept a radio on the shelf by the door.' });
    await expect(line).toBeVisible();
    await expect(line).toContainText('Grandma (sample)');
    const replay = line.getByTestId('replay');
    await expect(replay).toBeVisible();
    const src = await replay.getAttribute('data-src');
    expect(src?.startsWith(`${origin}/api/storage/`)).toBe(true); // rewritten from http://127.0.0.1:3210/...
    const probe = await page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength }; }, src);
    expect(probe.status).toBe(200);
    expect(probe.bytes).toBeGreaterThan(1000);
    await replay.click();
    await expect(replay).toHaveAttribute('data-state', /playing|ended/, { timeout: 10_000 });

    // The radio suggestion (live Claude) carries the same clip and attribution.
    const radio = objectItem(page, 'radio');
    await expect(radio).toBeVisible({ timeout: 20_000 });
    await expect(radio.getByTestId('object-attribution')).toContainText('said by Grandma (sample)');
    await expect(radio.getByTestId('replay')).toBeVisible();
    await shot(page, 'lan-replay');
    test.info().annotations.push({ type: 'lan', description: `${origin} ok; storage ${probe.type} ${probe.bytes} B; replay played` });
    expect(errors).toEqual([]);
    await deleteOwnedRoom(page);
    await ctx.close();
  });
});

test('photo: upload reports the prepared room or the explicit illustrative fallback without claiming reconstruction', async ({ browser }) => {
  const ctx = await browser.newContext({ ...IPHONE_13 });
  const page = await ctx.newPage();
  // "Use the sample content" on the welcome screen: a labeled sample room.
  await createRoomWithConsent(page, { title: '', sample: true, name: 'Karen (test)', scopes: { vendor_upload_modal: false, vendor_upload_worldlabs: false } });
  await expect(page.getByTestId('room-title')).toHaveText('Sample room: a living room, 1938');
  await expect(page.getByTestId('sample-ribbon')).toContainText('Sample content');
  await page.getByTestId('consent-continue').click();
  await expect(page.getByTestId('photo-screen')).toBeVisible();
  await page.getByTestId('photo-use-sample').click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-tone')).toHaveText('Black and white');
  await expect(page.getByTestId('photo-credit')).toHaveValue(/Library of Congress/);
  await expect(page.getByTestId('photo-will-sample')).toBeVisible();
  await shot(page, 'photo');
  await page.getByTestId('photo-upload').click();
  const mine = page.locator('[data-testid="splat-row"][data-mine="yes"]');
  await expect(mine).toBeVisible();
  const { client, api } = backend();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('memorygate.session.v1')));
  const room = await client.query(api.rooms.get, { code: session.code, token: session.token });
  if (room.splat?.status === 'ready') {
    await expect(mine).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
    await expect(mine.getByTestId('splat-message')).toHaveText('Using the sample room instead');
  } else {
    await expect(mine).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
    await expect(mine.getByTestId('splat-message')).toContainText('illustrative courtyard');
    await expect(page.getByTestId('photo-screen')).not.toContainText('Your room is ready');
  }
  await shot(page, 'photo-fallback');
  await deleteOwnedRoom(page);
  await ctx.close();
});
