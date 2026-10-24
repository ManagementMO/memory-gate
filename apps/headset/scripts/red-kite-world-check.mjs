// Run through IWSDK's managed browser. This proves rendering, not physical Quest comfort.
import { readFileSync } from 'node:fs';

export default async function run({ frame, page }) {
  const room = JSON.parse(readFileSync(new URL('../../../.logs/red-kite-demo-room.json', import.meta.url), 'utf8'));
  const f = frame ?? page.mainFrame();
  const url = new URL(f.url());
  url.search = new URLSearchParams({ room: room.code, view: 'spectator', drift: '0' }).toString();
  await f.goto(url.toString());
  await f.waitForFunction(() => window.__mg?.stats?.splatLoaded === true, null, { timeout: 45000 });
  await f.waitForTimeout(4500);
  return f.evaluate(() => {
    const s = window.__mg.stats;
    return { code: s.code, loaded: s.splatLoaded, source: s.splatSource, lite: s.splatLite,
      xrPresenting: s.xrPresenting ?? false, desktopCamera: s.desktopCamera,
      paused: s.paused ?? false, lastError: s.lastError ?? null, tickError: s.tickError ?? null,
      evidenceKind: 'managed-browser spectator rendering, not physical headset interaction' };
  });
}
