// Explicit paid retrieval rehearsal. No Tripo, World Labs or voice generation; one saved Apify run only.
import { expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { launchBrowser } from './browser.mjs';
if (!process.argv.includes('--run-place')) throw Error('Pass --run-place for one explicit live Apify place search.');
const out = '.logs/apify-live', session = `${out}/session.json`, attempt = `${out}/attempt.json`;
mkdirSync(out, { recursive: true });
const browser = await launchBrowser(), context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, ...(existsSync(session) ? { storageState: session } : {}) });
await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'xr', { get: () => undefined, configurable: true }));
const page = await context.newPage(), errors = [], checks = [], base = process.env.RED_KITE_ORIGIN ?? 'https://localhost:5180';
page.on('pageerror', e => errors.push(e.message.replace(/apify_api_[\w-]+/g, '<redacted>')));
try {
  await page.goto(`${base}/?story=red-kite&sources=live&objects=1&lite=1&emulate=1`);
  await expect(page.getByTestId('red-kite-experience')).toHaveAttribute('data-world-ready', 'true', { timeout: 90000 });
  await expect(page.getByTestId('object-workshop')).toBeVisible();
  await context.storageState({ path: session }); // contains member auth; ignored, never commit
  const runLink = page.getByRole('link', { name: /^View run/ });
  const previous = existsSync(attempt) ? JSON.parse(readFileSync(attempt, 'utf8')) : null;
  const retry = process.argv.includes('--retry-failed');
  if (retry && previous) {
    await expect(page.locator('.memory-job')).toContainText('(FAILED)');
    writeFileSync(`${out}/failed-${previous.runId ?? 'unknown'}.json`, JSON.stringify(previous, null, 2));
  }
  if (!previous || retry) {
    await page.getByTestId('place-query').fill('Golden Gate Park, San Francisco');
    await page.getByLabel('Send only this public place query to an outside search service. I will review the result.').check();
    await expect(page.getByTestId('find-place')).toBeEnabled();
    writeFileSync(attempt, JSON.stringify({ query: 'Golden Gate Park, San Francisco', attemptedAt: new Date().toISOString(), note: 'Do not submit a second run after an ambiguous start.' }, null, 2));
    await page.getByTestId('find-place').click();
    if (previous?.runId) await expect(runLink).toHaveAttribute('href', new RegExp(`/runs/(?!${previous.runId}$)[A-Za-z0-9]+$`), { timeout: 30000 });
  }
  await expect(runLink).toBeVisible({ timeout: 30000 });
  const runId = (await runLink.getAttribute('href')).split('/').at(-1);
  writeFileSync(attempt, JSON.stringify({ ...JSON.parse(readFileSync(attempt, 'utf8')), runId }, null, 2));
  console.log('Saved live parent run ' + runId);
  await expect(page.getByTestId('place-result').first().or(page.getByTestId('approved-place').first())).toBeVisible({ timeout: 230000 });
  checks.push('the app starts and resumes a real Apify cloud search and receives attributed Maps place references');
  if (await page.getByTestId('approve-place').count()) await page.getByTestId('approve-place').first().click();
  else await page.getByRole('button', { name: 'Choose for an object', exact: true }).first().click();
  const placeTitle = await page.getByTestId('approved-place').first().locator('strong').textContent();
  const sourceUrl = await page.getByTestId('approved-place').first().getByRole('link').getAttribute('href');
  assert.match(sourceUrl, /^https:\/\/(www\.)?google\.com\/maps/);
  checks.push('real place metadata remains private until family review and retains its original Maps link');
  const candidate = page.getByTestId('object-candidate');
  if (await candidate.count()) await page.getByTestId('preview-object').first().click();
  else {
    await page.getByTestId('object-model').selectOption('builtin:bridge');
    await page.getByTestId('object-note').fill('An optional bridge illustration to start a conversation about visiting this park.');
    await page.getByTestId('create-object').click();
  }
  await expect(page.getByTestId('model-preview')).toBeVisible();
  await page.waitForFunction(() => window.__memoryObjectScene?.snapshot().some(o => o.loaded));
  if (await page.getByTestId('approve-preview').count()) await page.getByTestId('approve-preview').click();
  await page.waitForFunction(() => window.__memoryObjectScene.snapshot().some(o => o.loaded && !o.preview));
  checks.push('a reviewed live place becomes the source for a separately approved original GLB');
  await page.waitForFunction(() => window.__redKite3D.emulator());
  await page.evaluate(() => { const d = window.__redKite3D.emulator(); if (d.devui) { d.devui.devUIContainer.style.display = 'none'; d.devui.render = () => undefined; } d.ipd = .064; d.stereoEnabled = true; });
  await page.getByTestId('enter-vr').click();
  await page.waitForFunction(() => window.__redKite3D.snapshot().xr && window.__redKite3D.snapshot().sourcePanel?.sourceId);
  await page.waitForTimeout(800); await page.screenshot({ path: `${out}/live-place-vr.png` });
  checks.push('the real place provenance and model render inside an actual stereo immersive session');
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/verification.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), runId, placeTitle, sourceUrl, checks, errors, modelGenerationCalls: 0, physicalQuestTested: false }, null, 2) + '\n');
  console.log(JSON.stringify({ checks: checks.length, runId, placeTitle, errors }));
} catch (error) {
  const notice = await page.locator('.memory-job,.memory-error').allTextContents();
  writeFileSync(`${out}/failure.json`, JSON.stringify({ error: String(error), notice, errors }, null, 2));
  console.error('Live check stopped; saved attempt and status retained. ' + String(error).slice(0, 220)); process.exitCode = 1;
} finally { await browser.close(); }
