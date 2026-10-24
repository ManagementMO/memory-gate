export default async function run({ frame, page }) {
  const f = frame ?? page.mainFrame();
  return f.evaluate(() => ({ xr: window.__mg.stats.xrPresenting, tickError: window.__mg.stats.tickError ?? null,
    placements: window.__mg.placements(), keepsakes: window.__mg.keepsakes(), gateOpen: window.__mg.stats.gateOpen ?? null }));
}
