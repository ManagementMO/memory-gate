// The phone dev server is reachable on the Wi-Fi, so it must not hand out repo files (the local Convex admin key lives
// in .convex/local/*/config.json, the worker secret in .env.worker), and a crafted ?convex= link must never be able to
// read the stored member token.
import { expect, test } from '@playwright/test';
import { backend, createRoomWithConsent, deleteOwnedRoom, IPHONE_13, lanIp, repoRoot } from './helpers.mjs';

test('the dev server serves only what the app needs from outside apps/phone', async ({ request }) => {
  const origin = `http://${lanIp() ?? '127.0.0.1'}:5173`;
  const fs = (p) => `${origin}/@fs${repoRoot}/${p}`;
  for (const secret of ['.convex/local/default/config.json', '.env.worker', '.env.local', 'auth/memory-gate.env', 'convex/rooms.ts', 'package.json']) {
    expect((await request.get(fs(secret))).status(), secret).toBe(403);
  }
  for (const needed of ['convex/_generated/api.js', 'packages/shared/src/flags.ts', 'fixtures/sample-photo-1938.jpg']) {
    expect((await request.get(fs(needed))).status(), needed).toBe(200);
  }
});

test('a ?convex= override starts with an empty session (the real token stays put)', async ({ browser }) => {
  const ctx = await browser.newContext({ ...IPHONE_13 });
  const page = await ctx.newPage();
  await createRoomWithConsent(page, { title: 'E2E: override', name: 'Karen (test)', scopes: { vendor_upload_modal: false, vendor_upload_worldlabs: false } });
  await page.goto('/?convex=http://127.0.0.1:3210');
  await expect(page.getByTestId('welcome')).toBeVisible(); // no session for that backend
  await page.goto('/');
  await expect(page.getByTestId('room-code')).toBeVisible(); // the normal session is untouched
  await deleteOwnedRoom(page);
  await ctx.close();
});

test('a new family invitation opens its requested room without silently reusing an older room session', async ({ browser }) => {
  const ctx = await browser.newContext({ ...IPHONE_13 }); const page = await ctx.newPage();
  const { client, api } = backend(); let target;
  try {
    const original = await createRoomWithConsent(page, { title: 'Existing room', name: 'Test family', scopes: { vendor_upload_modal: false, vendor_upload_worldlabs: false } });
    const saved = await page.evaluate(() => localStorage.getItem('memorygate.session.v1'));
    target = await client.mutation(api.rooms.create, { title: 'Invited room', displayName: 'Other test operator', offline: true });
    const key = (await client.query(api.rooms.get, target)).joinKey;
    await page.goto(`/?room=${target.code}&key=${key}`);
    await expect(page.getByTestId('welcome')).toBeVisible();
    await expect(page.getByTestId('join-code')).toHaveValue(target.code);
    await expect(page.getByTestId('join-role-family')).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('memorygate.session.v1'))).toBe(saved);
    await page.goto('/');
    await expect(page.getByTestId('room-code')).toHaveAttribute('data-code', original);
  } finally {
    await page.goto('/'); await deleteOwnedRoom(page);
    if (target) await client.mutation(api.consents.deleteMemory, { ...target, confirmText: target.code });
    await ctx.close();
  }
});
