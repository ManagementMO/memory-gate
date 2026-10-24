// IWSDK managed-browser helper (npx iwsdk browser run scripts/emu-open.mjs): join the test room from the app's own
// room-code screen inside the managed runtime frame (the shell owns the top-level page), then report the app's stats.
// ROOM env var overrides the code from .test-room.json.
import { readFileSync } from 'node:fs';

export default async function run({ frame, page }) {
  const room = JSON.parse(readFileSync(new URL('../.test-room.json', import.meta.url), 'utf8'));
  const code = process.env.ROOM || room.code;
  const f = frame ?? page.mainFrame();
  const already = await f.evaluate(() => window.__mg?.stats?.code ?? null).catch(() => null);
  if (already !== code) {
    const url = new URL(f.url());
    url.searchParams.set('room', code);
    if (room.key) url.searchParams.set('key', room.key);
    await f.goto(url.toString());
  }
  await f.waitForFunction(() => window.__mg?.stats?.sceneReady === true || window.__mg?.stats?.splatLoaded === true, null, { timeout: 45000 });
  await f.waitForTimeout(Number(process.env.WAIT || 4000));
  return { code, stats: await f.evaluate(() => window.__mg.stats) };
}
