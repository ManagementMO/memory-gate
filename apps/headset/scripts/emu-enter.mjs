export default async function run({ frame, page }) {
  const f = frame ?? page.mainFrame();
  const presenting = await f.evaluate(() => window.__mg?.stats.xrPresenting === true);
  if (!presenting) await f.getByTestId('enter-memory').click();
  await f.waitForFunction(() => window.__mg?.stats.xrPresenting === true, null, { timeout: 15_000 });
  return { presenting: true, scene: await f.evaluate(() => window.__mg.stats.sceneSource) };
}
