export default async function run({ frame, page }) {
  const f = frame ?? page.mainFrame();
  return f.evaluate(() => ({ xr: window.__mg.stats.xrPresenting, tickError: window.__mg.stats.tickError ?? null,
    scenery: { source: window.__mg.stats.splatSource ?? 'illustrative', loaded: window.__mg.stats.splatLoaded ?? false, lite: window.__mg.stats.splatLite ?? false },
    placements: window.__mg.placements(), keepsakes: window.__mg.keepsakes(), gateOpen: window.__mg.stats.gateOpen ?? null }));
}
