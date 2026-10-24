export default async function run({ frame, page }) {
  const f = frame ?? page.mainFrame();
  return f.evaluate(() => ({ xr: window.__mg.stats.xrPresenting, sessionMode: window.__mg.stats.xrSessionMode, framebufferScale: window.__mg.stats.fbScale,
    paused: window.__mg.stats.paused ?? false, caption: window.__mg.stats.caption ?? null, tickError: window.__mg.stats.tickError ?? null,
    pauseButtonValue: window.__mg.stats.pauseButtonValue ?? null, pauseButtonPresses: window.__mg.stats.pauseButtonPresses ?? 0, lastError: window.__mg.stats.lastError ?? null,
    scenery: { source: window.__mg.stats.splatSource ?? 'illustrative', loaded: window.__mg.stats.splatLoaded ?? false, lite: window.__mg.stats.splatLite ?? false },
    placements: window.__mg.placements(), keepsakes: window.__mg.keepsakes(), gateOpen: window.__mg.stats.gateOpen ?? null }));
}
