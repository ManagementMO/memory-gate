import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { backend, ref, makeRoom } from './helpers.mjs';

async function enter(browser, auth, name, role, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(session => { if (location.protocol === 'http:') localStorage.setItem('memorygate.session.v1', JSON.stringify(session)); }, { ...auth, name, role, sample: true });
  const page = await context.newPage();
  await page.goto('/#/memories');
  await expect(page.getByText('Shared collection connected')).toBeVisible();
  return { context, page };
}
test('two independent browsers pass, accept, open, reload and revoke; mobile has no overflow', async ({ browser }) => {
  const room = await makeRoom();
  const sender = await enter(browser, room.owner, 'Alex', 'family', { width: 1440, height: 900 });
  const recipient = await enter(browser, room.recipient, 'Sam', 'storyteller', { width: 390, height: 844 });
  try {
    await sender.page.getByRole('combobox', { name: 'Your story', exact: true }).selectOption(room.sourceId);
    await sender.page.getByLabel('A name for this memory').fill('The afternoon light');
    await sender.page.getByRole('combobox', { name: 'For someone in this room', exact: true }).selectOption(room.recipientId);
    await sender.page.getByRole('button', { name: 'Pass this memory' }).click();
    await expect(recipient.page.getByTestId('incoming-memory')).toContainText('The afternoon light');
    await mkdir('evidence/calhacks-exchange', { recursive: true });
    await sender.page.evaluate(() => scrollTo(0, 0));
    await sender.page.screenshot({ path: 'evidence/calhacks-exchange/desktop-pass.png', fullPage: true });
    await recipient.page.screenshot({ path: 'evidence/calhacks-exchange/mobile-receive.png', fullPage: true });
    await recipient.page.getByRole('button', { name: 'Accept memory', exact: true }).click();
    await expect(recipient.page.getByTestId('saved-memory')).toContainText('The afternoon light');
    await recipient.page.getByRole('button', { name: 'Open memory', exact: true }).click();
    await expect(recipient.page.getByTestId('opened-memory')).toContainText('fictional test story');
    await expect(recipient.page.getByTestId('opened-memory')).toContainText('Original typed words');
    await recipient.page.getByTestId('opened-memory').scrollIntoViewIfNeeded();
    await recipient.page.screenshot({ path: 'evidence/calhacks-exchange/mobile-open.png', fullPage: true });
    expect(await recipient.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await recipient.page.reload();
    await expect(recipient.page.getByTestId('saved-memory')).toContainText('The afternoon light');
    await recipient.page.getByRole('button', { name: 'Open memory', exact: true }).click();
    await expect(recipient.page.getByTestId('opened-memory')).toBeVisible();
    await sender.page.getByText('Memories you passed').click();
    await sender.page.getByRole('button', { name: 'Revoke access', exact: true }).click();
    await expect(recipient.page.getByTestId('saved-memory')).toHaveCount(0);
    await expect(recipient.page.getByTestId('opened-memory')).toHaveCount(0);
  } finally { await sender.context.close(); await recipient.context.close(); }
});

test('revoking family sharing clears an open collection', async ({ browser }) => {
  const room = await makeRoom(); const recipient = await enter(browser, room.recipient, 'Sam', 'storyteller', { width: 800, height: 900 });
  try {
    const view = await backend.query(ref('rooms:get'), room.owner);
    for (const consent of view.consents) await backend.mutation(ref('consents:revoke'), { ...room.owner, consentId: consent.id });
    await expect(recipient.page.getByText('Sharing is unavailable. Check your room membership and family-sharing permission.')).toBeVisible({ timeout: 12000 });
    await expect(recipient.page.getByText('Your collection', { exact: false })).toHaveCount(0);
  } finally { await recipient.context.close(); }
});

test('actual local Apify search, explicit choice, shared board and reload', async ({ browser }) => {
  test.skip(process.env.E2E_ARCHIVE !== '1', 'Explicit public internet request; run with E2E_ARCHIVE=1 and ATLAS_MODE=local.');
  test.setTimeout(200_000);
  const owner = await backend.mutation(ref('rooms:create'), { title: 'Public archive verification', displayName: 'Alex' });
  const view = await backend.query(ref('rooms:get'), owner);
  const guest = await backend.mutation(ref('rooms:join'), { code: owner.code, key: view.joinKey, displayName: 'Sam', role: 'family' });
  await backend.mutation(ref('consents:give'), { ...owner, scopes: ['share_with_family'] });
  const sender = await enter(browser, owner, 'Alex', 'family', { width: 1440, height: 900 });
  const recipient = await enter(browser, guest, 'Sam', 'family', { width: 390, height: 844 });
  try {
    await sender.page.getByRole('button', { name: 'Explore references', exact: true }).click();
    const use = sender.page.getByRole('button', { name: 'Use as a shared reference', exact: true });
    await expect(use.first()).toBeVisible({ timeout: 180_000 });
    await expect(sender.page.getByTestId('reference-board').locator('article')).toHaveCount(0);
    const title = await use.first().locator('..').getByRole('heading').textContent();
    await use.first().click();
    await expect(recipient.page.getByTestId('reference-board')).toContainText(title);
    await expect(recipient.page.getByTestId('reference-board').getByRole('button', { name: 'Remove reference' })).toHaveCount(0);
    await recipient.page.reload();
    await expect(recipient.page.getByTestId('reference-board')).toContainText(title);
    await recipient.page.getByTestId('reference-board').scrollIntoViewIfNeeded();
    await recipient.page.screenshot({ path: 'evidence/calhacks-exchange/mobile-archive.png', fullPage: true });
    expect(await recipient.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('.logs', { recursive: true });
    await writeFile('.logs/archive-restart.json', JSON.stringify({ owner, guest, title }));
  } finally { await sender.context.close(); await recipient.context.close(); }
});
