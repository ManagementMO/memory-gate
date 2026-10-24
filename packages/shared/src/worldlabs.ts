/** Marble's documented raw OpenCV -> metric -> Three frame. See docs.worldlabs.ai/api/rendering-spz. */
export function worldAssetPlan(world: unknown) {
  const value = world as { id?: string; world_id?: string; assets?: { splats?: {
    spz_urls?: Record<string, string>; semantics_metadata?: { metric_scale_factor?: number; ground_plane_offset?: number };
  } } };
  const splats = value?.assets?.splats;
  const urls = splats?.spz_urls;
  const url = urls?.['500k'] ?? urls?.['100k'];
  const liteUrl = urls?.['100k'] && urls['100k'] !== url ? urls['100k'] : null;
  for (const candidate of [url, liteUrl].filter(Boolean)) {
    if (new URL(candidate!).protocol !== 'https:') throw new Error('World asset must use HTTPS.');
  }
  if (!url) throw new Error('World Labs returned no bounded SPZ asset.');
  const scale = splats?.semantics_metadata?.metric_scale_factor;
  const offset = splats?.semantics_metadata?.ground_plane_offset;
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= .01 || scale > 20
      || typeof offset !== 'number' || !Number.isFinite(offset) || offset < .35 || offset > 3) {
    throw new Error('The generated floor needs calibration before headset viewing.');
  }
  // The renderer flips raw Y/Z. Translation by +offset then puts the metric ground at Y=0.
  return { url, liteUrl, numSplats: urls?.['500k'] ? 500_000 : 100_000,
    liteNumSplats: liteUrl ? 100_000 : null, scale, floorY: -offset / scale, worldId: value.world_id ?? value.id ?? null };
}
