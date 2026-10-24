// IWSDK managed-browser actions for the emulator check (npx iwsdk browser run scripts/emu-act.mjs), via env ACT:
//   enter          click the page's own "Enter the memory" button (trusted click → world.launchXR()), mock voice
//   say:<text>     a typed line from the headset (head ray pointer, same path as push-to-talk release)
//   type:<text>    put text in the "Say it by typing…" box (the mock voice returns it on push-to-talk release)
//   stats          just report the app's stats
export default async function run({ frame, page }) {
  const f = frame ?? page.mainFrame();
  const act = process.env.ACT || 'stats';
  let result = null;
  if (act === 'enter') {
    await f.evaluate(() => window.__mg.useMockVoice?.());
    await f.click('[data-testid=enter-memory]');
    await f.waitForFunction(() => window.__mg?.stats?.xrPresenting === true, null, { timeout: 20000 });
    await f.waitForTimeout(Number(process.env.WAIT || 4500));
  } else if (act.startsWith('say:')) {
    result = await f.evaluate((t) => window.__mg.say(t), act.slice(4));
  } else if (act.startsWith('type:')) {
    await f.evaluate((t) => { window.__mg.useMockVoice?.(); document.getElementById('mg-typed-input').value = t; }, act.slice(5));
  }
  if (process.env.WAITFOR) await f.waitForFunction((re) => new RegExp(re).test(JSON.stringify(window.__mg?.stats ?? {})), process.env.WAITFOR, { timeout: 45000 });
  return { act, result, stats: await f.evaluate(() => window.__mg.stats) };
}
