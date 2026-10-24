// Two independent phones in one room: live sync, undo, pause, persistence across reloads, and a typed line that goes
// through the live Claude extraction (flags are live on the local deployment; this costs fractions of a cent).
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { deleteOwnedRoom, IPHONE_13, objectItem, SCREENS, shot } from './helpers.mjs';

test.describe.serial('two phones in one room', () => {
  /** @type {import('@playwright/test').BrowserContext} */ let ctxA;
  /** @type {import('@playwright/test').BrowserContext} */ let ctxB;
  /** @type {import('@playwright/test').Page} */ let a;
  /** @type {import('@playwright/test').Page} */ let b;
  let code = '';
  const errors = [];

  test.beforeAll(async ({ browser }) => {
    ctxA = await browser.newContext({ ...IPHONE_13 }); // phone A: iPhone 13 size, touch
    ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } }); // phone B: a desktop-sized window
    a = await ctxA.newPage();
    b = await ctxB.newPage();
    for (const [who, p] of [['A', a], ['B', b]]) {
      p.on('pageerror', (e) => errors.push(`${who} pageerror: ${e.message}`));
      p.on('console', (m) => { if (m.type() === 'error') errors.push(`${who} console: ${m.text()}`); });
    }
  });

  test.afterAll(async () => {
    if (a) await deleteOwnedRoom(a);
    await ctxA?.close();
    await ctxB?.close();
  });

  test('A creates a room and gives consent (voice recording stays off by default)', async () => {
    await a.goto(process.env.E2E_LIVE === '1' ? '/' : '/?mode=offline');
    await expect(a.getByTestId('welcome')).toBeVisible();
    await shot(a, 'welcome');
    await a.getByTestId('create-title').fill('E2E: the front room');
    await a.getByTestId('create-name').fill('Karen (test)');
    await a.getByTestId('create-submit').click();
    await expect(a.getByTestId('consent-screen')).toBeVisible();
    await expect(a.getByTestId('consent-notices')).toContainText('Conversations are recorded and may be shared with Cartesia and its third-party large language model providers.');
    await expect(a.getByTestId('scope-voice_recording')).not.toBeChecked();
    await expect(a.getByTestId('scope-photo_processing')).toBeChecked();
    // No GPU or World Labs uploads from the e2e run.
    await a.getByTestId('scope-vendor_upload_modal').uncheck();
    await a.getByTestId('scope-vendor_upload_worldlabs').uncheck();
    await shot(a, 'consent');
    await a.getByTestId('consent-submit').click();
    await expect(a.getByTestId('consent-row')).toHaveCount(1);
    await expect(a.getByTestId('consent-row')).toContainText('Karen (test)');
    await a.getByTestId('tab-story').click();
    await expect(a.getByTestId('live-screen')).toBeVisible();
    await expect(a.getByTestId('objects-empty')).toContainText('Nothing in the room yet');
    code = (await a.getByTestId('room-code').getAttribute('data-code')) ?? '';
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  test('B joins with the code', async () => {
    // The code is on screens, so alone it only lets someone watch; family joins need the family key from A's phone.
    const familyKey = ((await a.getByTestId('family-key').locator('strong').textContent()) ?? '').trim();
    expect(familyKey).toMatch(/^[A-Z2-9]{8}$/);
    await b.goto('/');
    await b.getByTestId('join-code').fill(code);
    await b.getByTestId('join-name').fill('Sam (test)');
    await b.getByTestId('join-key').fill(familyKey); // (joining without it is refused: covered by the smoke tests)
    await b.getByTestId('join-submit').click();
    await expect(b.getByTestId('live-screen')).toBeVisible();
    await expect(b.getByTestId('room-title')).toHaveText('E2E: the front room');
    await expect(b.getByTestId('room-code')).toHaveAttribute('data-code', code);
  });

  test('A adds "chair" and B sees it live as Suggested', async () => {
    await a.getByTestId('add-object-input').fill('chair');
    await a.getByTestId('add-object-submit').click();
    await expect(objectItem(b, 'chair').getByTestId('object-status')).toHaveText('Suggested');
    await expect(objectItem(b, 'chair').getByTestId('object-model')).toHaveText('Library model');
    await expect(objectItem(b, 'chair').getByTestId('object-attribution')).toContainText('added by Karen (test)');
    await expect(objectItem(a, 'chair').getByTestId('object-status')).toHaveText('Suggested');
    await shot(a, 'live-ghost');
  });

  test('B confirms and A sees "In the room"', async () => {
    await objectItem(b, 'chair').getByTestId('object-confirm').click();
    await expect(objectItem(a, 'chair').getByTestId('object-status')).toHaveText('In the room');
    await expect(objectItem(a, 'chair').getByTestId('object-confirmed-by')).toContainText('Sam (test)');
    await expect(objectItem(a, 'chair').getByTestId('object-confirm')).toHaveCount(0);
    await shot(a, 'confirmed');
  });

  test('A undoes and both see it back as Suggested', async () => {
    await expect(a.getByTestId('undo-button')).toContainText('Undo confirming “chair”');
    await a.getByTestId('undo-button').click();
    await expect(objectItem(a, 'chair').getByTestId('object-status')).toHaveText('Suggested');
    await expect(objectItem(b, 'chair').getByTestId('object-status')).toHaveText('Suggested');
    await expect(a.getByTestId('undo-button')).toContainText('Undo the suggestion “chair”');
  });

  test('reloading both pages keeps the session and the room state', async () => {
    await Promise.all([a.reload(), b.reload()]);
    for (const p of [a, b]) {
      await expect(p.getByTestId('live-screen')).toBeVisible();
      await expect(p.getByTestId('room-code')).toHaveAttribute('data-code', code);
      await expect(objectItem(p, 'chair').getByTestId('object-status')).toHaveText('Suggested');
    }
  });

  test('pause on A shows the paused room on B, and resume restores it', async () => {
    await a.getByTestId('pause-toggle').click();
    await expect(b.getByTestId('paused-banner')).toBeVisible();
    await expect(b.getByTestId('pause-toggle')).toHaveAttribute('data-paused', 'yes');
    await a.getByTestId('pause-toggle').click();
    await expect(b.getByTestId('paused-banner')).toHaveCount(0);
    await expect(a.getByTestId('pause-toggle')).toHaveAttribute('data-paused', 'no');
  });

  test('a typed line reaches the configured interpreter and a piano suggestion appears on both phones within 15 s', async () => {
    const started = Date.now();
    await a.getByTestId('tell-input').fill('There was a piano under the window');
    await a.getByTestId('tell-submit').click();
    const pianoA = a.locator('[data-testid="object-item"][data-label*="piano"]');
    const pianoB = b.locator('[data-testid="object-item"][data-label*="piano"]');
    await expect(pianoA).toBeVisible({ timeout: 15_000 });
    await expect(pianoB).toBeVisible({ timeout: 15_000 });
    const ms = Date.now() - started;
    await expect(pianoA.getByTestId('object-status')).toHaveText('Suggested');
    await expect(pianoA.getByTestId('object-quote')).toContainText('piano');
    await expect(pianoA.getByTestId('object-attribution')).toContainText('said by Karen (test)');
    const line = a.getByTestId('utterance-item').filter({ hasText: 'There was a piano under the window' });
    await expect(line).toHaveAttribute('data-status', 'done');
    await expect(line.getByTestId('utterance-intent')).toHaveText('Suggested an object');
    const mock = await line.getByTestId('utterance-mock').count();
    test.info().annotations.push({ type: 'piano', description: `visible on both phones after ${ms} ms; ai mode ${mock ? 'mock (badge shown)' : 'live'}` });
    await shot(a, 'live-piano');
    await b.screenshot({ path: path.join(SCREENS, 'phone-desktop-b.png'), style: '.toasts{display:none!important}' });
  });

  test('B says "Not quite" to the piano: it leaves both lists; A undoes the reject and it is Suggested again', async () => {
    const pianoA = a.locator('[data-testid="object-item"][data-label*="piano"]');
    const pianoB = b.locator('[data-testid="object-item"][data-label*="piano"]');
    await pianoB.getByTestId('object-reject').click();
    await expect(pianoA).toHaveCount(0);
    await expect(pianoB).toHaveCount(0);
    await expect(a.getByTestId('undo-button')).toContainText('Undo “not quite”');
    await a.getByTestId('undo-button').click();
    await expect(pianoA.getByTestId('object-status')).toHaveText('Suggested');
    await expect(pianoB.getByTestId('object-status')).toHaveText('Suggested');
  });

  test('a Spanish line keeps the words as spoken and shows an English translation on both phones', async () => {
    test.skip(process.env.E2E_LIVE !== '1', 'Free-form translation needs an explicit live-provider check: npm run e2e:live.');
    const spoken = 'Mi hermana cantaba en la cocina todas las mañanas.';
    await a.getByTestId('tell-input').fill(spoken);
    await a.getByTestId('tell-submit').click();
    for (const p of [a, b]) {
      const line = p.getByTestId('utterance-item').filter({ hasText: spoken });
      await expect(line).toHaveAttribute('data-status', 'done', { timeout: 20_000 });
      await expect(line.getByTestId('utterance-text')).toHaveText(`“${spoken}”`);
      await expect(line.getByTestId('utterance-translation')).toContainText(/sister/i);
      await expect(line).toContainText('Spanish');
    }
    await shot(a, 'translation');
  });

  test('the owner opens the admin screen (flags, jobs, reset, delete)', async () => {
    await a.getByTestId('admin-open').click();
    await expect(a.getByTestId('admin-screen')).toBeVisible();
    await expect(a.getByTestId('flags-panel')).toBeVisible();
    await expect(a.getByTestId('flag-ai.live')).toHaveAttribute('role', 'switch');
    await expect(a.getByTestId('jobs-panel')).toBeVisible();
    await expect(a.getByTestId('delete-confirm')).toBeDisabled();
    await a.getByTestId('family-names').fill('Wilhelmina, Elm Street');
    await a.getByTestId('family-names-save').click();
    await expect(a.getByTestId('family-names-saved')).toContainText('Wilhelmina, Elm Street');
    await shot(a, 'admin');
    // B joined as family but is not the owner: no admin entry point.
    await expect(b.getByTestId('admin-open')).toHaveCount(0);
  });

  test('no page errors on either phone', async () => {
    expect(errors).toEqual([]);
  });
});
