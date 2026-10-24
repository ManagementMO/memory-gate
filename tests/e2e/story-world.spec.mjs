import { test, expect, chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { backend, repoRoot, SCREENS, createRoomWithConsent, deleteOwnedRoom, wav } from './helpers.mjs';

// The full 500k render uses installed Chrome, as do the live voice and managed XR rehearsals.
// The bundled headless shell can render too slowly to finish a time-based reveal on this Mac.
test.use({ channel: 'chrome' });

test('the cached setting opens without generation permission, then typed words form a reviewable 3D detail', async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  const phone = await context.newPage(), head = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  const renderErrors = []; head.on('pageerror', e => renderErrors.push(e.message));
  try {
    const code = await createRoomWithConsent(phone, { title: 'Cached courtyard story check', name: 'Alex (fictional test)', sample: true,
      scopes: { vendor_upload_modal: false, vendor_upload_worldlabs: false, voice_recording: false } });
    await phone.getByTestId('tab-story').click();
    await phone.getByTestId('practice-world-open').click();
    await expect(phone.getByTestId('story-place-result')).toHaveAttribute('data-status', 'ready');
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await phone.screenshot({ path: path.join(SCREENS, 'world-story-phone.png'), fullPage: true });
    await head.goto(`https://localhost:4173/?room=${code}&view=spectator&drift=0`);
    await head.waitForFunction(() => window.__mg?.stats.splatLoaded === true);
    expect(await head.evaluate(() => window.__mg.stats.splatLite)).toBe(false);
    expect(await head.evaluate(() => window.__mg.stats.desktopCamera.fov)).toBe(78);
    await phone.getByTestId('tell-input').fill('There was a wooden bench. We used to sit there together after lunch.');
    await phone.getByTestId('tell-submit').click();
    const bench = phone.locator('[data-testid="object-item"][data-label*="bench"]').first();
    await expect(bench).toHaveAttribute('data-status', 'ghost');
    await expect(head.getByTestId('story-state')).toHaveAttribute('data-state', 'review');
    await bench.getByTestId('object-confirm').click();
    await expect(bench).toHaveAttribute('data-status', 'confirmed');
    await head.bringToFront();
    try { await head.waitForFunction(() => window.__mg.placements().some(o => /bench/.test(o.label) && o.phase === 'solid'), null, { timeout: 12000 }); }
    catch (error) { console.log(JSON.stringify({ renderErrors, render: await head.evaluate(() => ({ stats: window.__mg.stats, objects: window.__mg.placements() })) })); throw error; }
    await expect(head.getByTestId('story-state')).toHaveAttribute('data-state', 'together');
    await phone.getByTestId('pause-toggle').click();
    await expect(head.getByTestId('story-state')).toHaveAttribute('data-state', 'paused');
    expect(await head.evaluate(() => window.__mg.stats.tickError ?? null)).toBe(null);
  } finally { await deleteOwnedRoom(phone); await context.close().catch(() => {}); }
});

async function narration(client, api, owner) {
  const sentence = 'There was a wooden bench. We used to sit there together after lunch.';
  const file = path.join(repoRoot, 'evidence/raw/courtyard-story-en.wav');
  if (!existsSync(file)) {
    const m = await client.action(api.voice.mintToken, owner);
    const response = await fetch('https://api.cartesia.ai/tts/bytes', { method: 'POST', headers: { Authorization: `Bearer ${m.token}`, 'Cartesia-Version': m.cartesiaVersion, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: m.ttsModel, transcript: sentence, language: 'en', voice: { mode: 'id', id: m.voiceId }, output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 16000 } }) });
    if (!response.ok) throw new Error(`Synthetic narration HTTP ${response.status}`);
    const raw = Buffer.from(await response.arrayBuffer()); let pcm;
    for (let offset = 12; offset + 8 <= raw.length;) {
      const size = raw.readUInt32LE(offset + 4);
      if (raw.toString('ascii', offset, offset + 4) === 'data') { pcm = raw.subarray(offset + 8, size === 0xffffffff ? raw.length : offset + 8 + size); break; }
      offset += 8 + size + (size & 1);
    }
    if (!pcm) throw new Error('Narration contains no PCM.');
    const body = Buffer.concat([Buffer.alloc(3 * 32000), pcm, Buffer.alloc(20 * 32000)]), header = wav(0);
    header.writeUInt32LE(36 + body.length, 4); header.writeUInt32LE(body.length, 40);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, Buffer.concat([header, body]));
    writeFileSync(file + '.json', JSON.stringify({ sentence, speechSec: pcm.length / 32000, kind: 'synthesized test voice, not a family recording' }));
  }
  return { file, ...JSON.parse(readFileSync(file + '.json', 'utf8')) };
}

test('spoken narration forms a bench inside the real cached world, and selecting it replays the same captured clip', async () => {
  test.skip(process.env.E2E_LIVE !== '1', 'Explicit live Cartesia / Claude check. World Labs generation is never called.');
  test.setTimeout(110000);
  const { client, api } = backend();
  const owner = await client.mutation(api.rooms.create, { title: 'The courtyard · synthetic voice rehearsal', displayName: 'Sample narrator (synthetic test)', demo: true });
  let browser, context, video;
  try {
    await client.mutation(api.consents.give, { ...owner, scopes: ['voice_processing', 'voice_recording', 'share_with_family'] });
    await client.mutation(api.splats.usePracticeWorld, owner);
    const key = (await client.query(api.rooms.get, owner)).joinKey, speech = await narration(client, api, owner);
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${speech.file}`, '--autoplay-policy=no-user-gesture-required'] });
    context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, ...(process.env.E2E_RECORD === '1' ? { recordVideo: { dir: path.join(repoRoot, '.logs/story-recordings') } } : {}) });
    const phone = await context.newPage(), head = await context.newPage(); video = head.video();
    await phone.goto(`http://127.0.0.1:5173/?room=${owner.code}&key=${key}`);
    await phone.getByTestId('join-name').fill('Ana (synthetic test)'); await phone.getByTestId('join-submit').click();
    await head.goto(`https://localhost:4173/?room=${owner.code}&view=spectator&drift=0&audio=1`);
    await head.waitForFunction(() => window.__mg?.stats.splatLoaded === true); await head.waitForTimeout(3500);
    await phone.getByTestId('voice-enable').click(); await expect(phone.getByTestId('voice-record')).toBeVisible({ timeout: 30000 });
    await phone.getByTestId('voice-record').click(); await phone.waitForTimeout(Math.ceil((3 + speech.speechSec + 1) * 1000)); await phone.getByTestId('voice-record').click();
    const bench = phone.locator('[data-testid="object-item"][data-label*="bench"]').first();
    await expect(bench).toHaveAttribute('data-status', 'ghost', { timeout: 30000 });
    const recognized = await phone.getByTestId('story-moment').textContent(); expect(recognized).toMatch(/wooden bench/i);
    await head.waitForFunction(() => window.__mg.placements().some(o => /bench/.test(o.label) && o.phase === 'ghost'));
    await head.screenshot({ path: path.join(SCREENS, 'world-story-suggestion.png') });
    await bench.getByTestId('object-confirm').click();
    await head.waitForFunction(() => window.__mg.placements().some(o => /bench/.test(o.label) && o.phase === 'solid'));
    const id = await head.evaluate(() => window.__mg.placements().find(o => /bench/.test(o.label)).id), point = await head.evaluate(id => window.__mg.objectScreenPoint(id), id);
    expect(point.depth).toBeLessThan(1); expect(point.x).toBeGreaterThan(0); expect(point.y).toBeLessThan(800);
    await head.mouse.click(point.x, point.y); await head.waitForFunction(() => window.__mg.stats.lastReplayAudio === 'playing');
    await head.waitForFunction(() => /Ana.*bench/is.test(window.__mg.stats.caption ?? ''));
    const proof = await head.evaluate(() => ({ source: window.__mg.stats.splatSource, lite: window.__mg.stats.splatLite, camera: window.__mg.stats.desktopCamera,
      replay: window.__mg.stats.lastReplay, caption: window.__mg.stats.caption, tickError: window.__mg.stats.tickError ?? null, objects: window.__mg.placements() }));
    expect(proof.lite).toBe(false); expect(proof.tickError).toBe(null); expect(proof.replay).toMatch(/Ana.*bench/i);
    await head.screenshot({ path: path.join(SCREENS, 'world-story-replay.png') });
    writeFileSync(path.join(SCREENS, '../world-story.json'), JSON.stringify({ kind: 'Live STT and stored synthesized microphone capture, cached World Labs world, actual rendered pointer selection', recognized, proof }, null, 2));
  } finally {
    await context?.close(); if (video) await video.saveAs(path.join(SCREENS, '../world-story-demo.webm')); await browser?.close();
    await client.mutation(api.consents.deleteMemory, { ...owner, confirmText: owner.code });
  }
});
