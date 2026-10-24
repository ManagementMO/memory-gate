/** Complete generated environments can contain sky/landscape hundreds of meters from their source camera. */
export function environmentFarPlane(source: string): number {
  return source === 'worldlabs' ? 1000 : 200;
}

/** A background only: the live story's freestanding objects remain independently interactive. */
export function storyWorldPrompt(transcript: string): string {
  const words = transcript.trim();
  if (words.length < 24 || words.length > 2000) throw new Error('Choose a story with 24–2,000 characters describing a place.');
  return `Create a beautifully crafted, life-size place inspired by the following narrator's words. This is an imagined interpretation, not a historically verified reconstruction.\n<story>\n${words}\n</story>\nUse coherent architectural forms, tactile weathered materials, natural colors and soft, physically plausible daylight. Subtle painterly simplification is welcome; prioritize clear silhouettes, convincing depth and a calm high-quality VR environment over photographic detail. Avoid faceted low-poly forms, plastic surfaces, smeared geometry, heavy bloom and a sepia filter. No people or written words. Keep the central foreground level and unobstructed for separate interactive keepsakes and furniture: at least 6 meters wide and 8 meters deep. The viewer is stationary at adult eye level, facing into the open place. Put architecture and plants around the perimeter. Do not bake any freestanding benches, gates, trees, furniture, photographs or story props into the open foreground; those will be added interactively by the family. Preserve a quiet, comfortable sense of scale. Do not add dramatic weather, sudden events or moving people.`;
}

/** Marble's documented raw OpenCV -> metric -> Three frame. See docs.worldlabs.ai/api/rendering-spz. */
export function worldAssetPlan(world: unknown) {
  const value = world as { id?: string; world_id?: string; assets?: { thumbnail_url?: string; splats?: {
    spz_urls?: Record<string, string>; semantics_metadata?: { metric_scale_factor?: number; ground_plane_offset?: number };
  } } };
  const splats = value?.assets?.splats;
  const urls = splats?.spz_urls;
  const url = urls?.['500k'] ?? urls?.['100k'];
  const liteUrl = urls?.['100k'] && urls['100k'] !== url ? urls['100k'] : null;
  const thumbnail = value?.assets?.thumbnail_url;
  const previewUrl = thumbnail && new URL(thumbnail).protocol === 'https:' ? thumbnail : null;
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
  return { url, liteUrl, previewUrl, numSplats: urls?.['500k'] ? 500_000 : 100_000,
    liteNumSplats: liteUrl ? 100_000 : null, scale, floorY: -offset / scale, worldId: value.world_id ?? value.id ?? null };
}
