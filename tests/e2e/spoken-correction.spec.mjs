import { test, expect, chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { backend, repoRoot, SCREENS, wav } from './helpers.mjs';

const SENTENCE = 'Mueve el banco al lado del árbol, mirando hacia la puerta.';
async function fixture(client, api, room) {
  const file = path.join(repoRoot, 'evidence/raw/correction-es-16k.wav');
  if (!existsSync(file)) {
    const m = await client.action(api.voice.mintToken, room);
    const response = await fetch('https://api.cartesia.ai/tts/bytes', { method: 'POST',
      headers: { Authorization: `Bearer ${m.token}`, 'Cartesia-Version': m.cartesiaVersion, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: m.ttsModel, transcript: SENTENCE, language: 'es', voice: { mode: 'id', id: m.voiceId },
        output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 16000 } }),
    });
    if (!response.ok) throw new Error(`Synthetic speech fixture failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    let pcm = null;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const count = bytes.readUInt32LE(offset + 4);
      if (bytes.toString('ascii', offset, offset + 4) === 'data') { pcm = bytes.subarray(offset + 8, count === 0xffffffff ? bytes.length : offset + 8 + count); break; }
      offset += 8 + count + (count & 1);
    }
    if (!pcm) throw new Error('Synthetic fixture has no PCM data.');
    // A long tail prevents a second spoken loop. Audio is injected through a real-time fake microphone.
    const body = Buffer.concat([Buffer.alloc(3 * 16000 * 2), pcm, Buffer.alloc(20 * 16000 * 2)]);
    const header = wav(0); header.writeUInt32LE(36 + body.length, 4); header.writeUInt32LE(body.length, 40);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, Buffer.concat([header, body]));
    writeFileSync(file + '.json', JSON.stringify({ kind: 'synthesized Spanish test fixture, not a family recording', sentence: SENTENCE, speechSec: pcm.length / 32000 }));
  }
  return { file, ...JSON.parse(readFileSync(file + '.json', 'utf8')) };
}

test('Spanish speech creates a source-linked 3D correction, and selecting the moved bench replays that exact recording', async () => {
  test.skip(process.env.E2E_LIVE !== '1', 'Explicit live-provider check: npm run e2e:live.');
  test.setTimeout(100_000);
  const { client, api } = backend();
  const owner = await client.mutation(api.rooms.create, { title: 'Spanish spoken correction · synthetic test', displayName: 'Fixture operator', demo: true });
  let browser, video, recordingContext;
  try {
    await client.mutation(api.consents.give, { ...owner, scopes: ['voice_processing', 'voice_recording', 'share_with_family'] });
    await client.mutation(api.objects.practiceCourtyard, { ...owner, commandId: crypto.randomUUID() });
    const key = (await client.query(api.rooms.get, owner)).joinKey;
    const speech = await fixture(client, api, owner);
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${speech.file}`, '--autoplay-policy=no-user-gesture-required'] });
    const phone = await browser.newPage({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 430, height: 900 } });
    recordingContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 },
      ...(process.env.E2E_RECORD === '1' ? { recordVideo: { dir: path.join(repoRoot, '.logs/recordings'), size: { width: 1280, height: 800 } } } : {}) });
    const head = await recordingContext.newPage();
    video = head.video();
    await phone.goto(`/?room=${owner.code}&key=${key}`);
    await phone.getByTestId('join-name').fill('Ana (synthetic test)');
    await phone.getByTestId('join-submit').click();
    await head.goto(`https://localhost:8081/?room=${owner.code}&view=spectator&drift=0&audio=1`);
    await head.waitForFunction(() => window.__mg?.placements?.().filter(o => o.phase === 'solid').length === 4);
    await phone.bringToFront();
    await phone.getByTestId('voice-enable').click();
    await expect(phone.getByTestId('voice-record')).toBeVisible({ timeout: 30_000 });
    await phone.getByTestId('voice-record').click();
    await phone.waitForTimeout(Math.ceil((3 + speech.speechSec + 1) * 1000));
    await phone.getByTestId('voice-record').click();
    const preview = phone.getByTestId('correction-preview');
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview).toContainText('bench');
    await expect(preview.locator('audio')).toBeVisible();
    const recognized = await phone.getByTestId('utterance-text').first().textContent();
    expect(recognized).toMatch(/banco.*[aá]rbol.*puerta/i);
    const before = await head.evaluate(() => window.__mg.placements().find(o => o.label === 'bench' && !o.preview));
    await phone.getByTestId('correction-confirm').click();
    await expect.poll(async () => head.evaluate(id => window.__mg.placements().find(o => o.id === id).position[0], before.id)).not.toBeCloseTo(before.position[0], 1);
    await phone.waitForTimeout(900);
    await head.bringToFront();
    const point = await head.evaluate(id => window.__mg.objectScreenPoint(id), before.id);
    expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(1280);
    expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(800);
    await head.mouse.click(point.x, point.y);
    await head.waitForFunction(() => window.__mg.stats.lastReplayAudio === 'playing');
    await head.waitForFunction(() => { const f = window.__mg.captionFrame(); return f.visible && f.inside; });
    const proof = await head.evaluate(() => ({ replay: window.__mg.stats.lastReplay, caption: window.__mg.stats.caption,
      count: window.__mg.stats.replayCount, tickError: window.__mg.stats.tickError ?? null }));
    expect(proof.replay).toMatch(/Ana \(synthetic test\).*banco/i);
    expect(proof.caption).toContain('Move the bench');
    expect(proof.tickError).toBe(null);
    await head.screenshot({ path: path.join(SCREENS, 'spoken-correction-replay-3d.png') });
    writeFileSync(path.join(SCREENS, '../spoken-correction.json'), JSON.stringify({ kind: 'live Cartesia STT and stored synthesized-microphone recording; real rendered pointer selection', recognized, proof }, null, 2));
  } finally {
    try {
      await recordingContext?.close();
      if (video) await video.saveAs(path.join(repoRoot, 'evidence/review-2026-10-23/demo-correction.webm'));
    } finally {
      await browser?.close();
      await client.mutation(api.consents.deleteMemory, { ...owner, confirmText: owner.code });
    }
  }
});
