import { test, expect } from '@playwright/test';
import { createRoomWithConsent, deleteOwnedRoom, IPHONE_13, SCREENS } from './helpers.mjs';
import path from 'node:path';

test('a bilingual placement preview, confirmation and undo synchronize two phones and the real 3D renderer', async ({ browser }) => {
  test.setTimeout(100_000);
  const ctxA = await browser.newContext({ ...IPHONE_13 });
  const ctxB = await browser.newContext();
  const ctx3d = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  const a = await ctxA.newPage(), b = await ctxB.newPage(), head = await ctx3d.newPage();
  const errors = [];
  head.on('pageerror', error => errors.push(error.message));
  try {
    const code = await createRoomWithConsent(a, { title: 'Illustrative correction practice', name: 'Ana (sample)', sample: true,
      scopes: { vendor_upload_modal: false, vendor_upload_worldlabs: false } });
    await a.getByTestId('tab-story').click();
    const key = await a.getByTestId('family-key').locator('strong').textContent();
    await a.getByTestId('practice-load').click();
    await expect(a.getByTestId('object-item')).toHaveCount(4);
    await b.goto(`/?room=${code}&key=${key}`);
    await b.getByTestId('join-name').fill('Sam (sample)');
    await b.getByTestId('join-submit').click();
    await expect(b.getByTestId('object-item')).toHaveCount(4);
    // The headless Windows compositor may suspend animation in background windows.
    await head.bringToFront();
    await head.goto(`${process.env.HEADSET_URL ?? 'https://localhost:8081'}/?room=${code}&view=spectator&drift=0`);
    await expect.poll(async () => {
      if (errors.length) throw new Error(`Headset runtime: ${errors.join('; ')}`);
      const lastError = await head.evaluate(() => window.__mg?.stats.lastError ?? null);
      if (lastError) throw new Error(`Headset state: ${lastError}`);
      return head.evaluate(() => ({ ready: window.__mg?.stats.sceneReady ?? false, objects: window.__mg?.placements?.().filter(o => o.phase === 'solid').length ?? 0 }));
    }, { timeout: 45_000 }).toEqual({ ready: true, objects: 4 });
    const readBench = () => head.evaluate(() => window.__mg.placements().find(o => o.label === 'bench' && !o.preview));
    const before = await readBench();
    await a.getByTestId('tell-input').fill('Mueve el banco al lado del árbol, mirando hacia la puerta.');
    await a.getByTestId('tell-submit').click();
    for (const p of [a, b]) await expect(p.getByTestId('correction-preview')).toContainText('bench');
    await head.bringToFront();
    await head.waitForFunction(() => window.__mg.placements().some(o => o.preview && o.label === 'bench'));
    expect((await readBench()).position).toEqual(before.position);
    await head.screenshot({ path: path.join(SCREENS, 'correction-preview-3d.png') });
    await a.getByTestId('tell-input').fill('No lo muevas.');
    await a.getByTestId('tell-submit').click();
    await expect(a.getByTestId('utterance-item').filter({ hasText: 'No lo muevas.' })).toHaveAttribute('data-status', 'done');
    await expect(b.getByTestId('correction-preview')).toHaveCount(1);
    expect((await readBench()).position).toEqual(before.position);
    // Scroll from the long conversation into an actual hittable control; no forced click can hide an overlay bug.
    await b.getByTestId('correction-confirm').click();
    for (const p of [a, b]) await expect(p.getByTestId('correction-preview')).toHaveCount(0);
    await expect.poll(async () => (await readBench()).position[0]).not.toBeCloseTo(before.position[0], 1);
    const map = a.locator(`[data-map-id="${before.id}"]`);
    const expectedX = Number(await map.getAttribute('data-x')), expectedZ = Number(await map.getAttribute('data-z'));
    await expect.poll(async () => (await readBench()).position[0]).toBeCloseTo(expectedX, 2);
    await expect.poll(async () => (await readBench()).position[2]).toBeCloseTo(expectedZ, 2);
    const after = await readBench();
    expect(after.yaw).not.toBeCloseTo(before.yaw, 1);
    await expect(a.getByTestId('object-item').filter({ hasText: 'Placement remembered' })).toContainText('Mueve el banco');
    await head.screenshot({ path: path.join(SCREENS, 'correction-confirmed-3d.png') });
    await a.screenshot({ path: path.join(SCREENS, 'correction-confirmed-phone.png'), fullPage: true });
    await a.getByTestId('undo-button').click();
    await head.bringToFront();
    await expect.poll(async () => (await readBench()).position[0]).toBeCloseTo(before.position[0], 2);
    await expect.poll(async () => (await readBench()).position[2]).toBeCloseTo(before.position[2], 2);
    expect(errors).toEqual([]);
    expect(await head.evaluate(() => window.__mg.stats.tickError ?? null)).toBe(null);
  } catch (error) {
    console.error('Renderer diagnostic', await head.evaluate(() => ({ phase: window.__mg?.stats.phase, fps: window.__mg?.stats.fps,
      objects: window.__mg?.stats.objectRecords, tickError: window.__mg?.stats.tickError,
      placements: window.__mg?.placements?.().map(o => ({ label: o.label, phase: o.phase })) })).catch(() => ({})));
    throw error;
  } finally {
    await deleteOwnedRoom(a);
    await Promise.all([ctxA.close(), ctxB.close(), ctx3d.close()]);
  }
});
