/** Capture planning only. These values do not authorize uploads, generation, or VR navigation. */
export type PalaceCapture = {
  schema: 'memory-gate.palace-capture/1';
  title: string;
  capturePosition: string;
  rights: string;
  reviewedForUpload: boolean;
  images: { file: string; azimuthDegrees?: number }[];
  measuredReference: { label: string; meters: number } | null;
};

export const PALACE_PROMPT = `A beautiful, calm, life-size VR interpretation of the Palace of Fine Arts in San Francisco, grounded in these views of one place. Preserve the visible rotunda, curved colonnades, lagoon edge and relative architectural proportions wherever they appear in the source. Warm sandstone and muted terracotta, sage foliage, restrained blue-green water, soft Bay Area daylight and tactile weathering. Use refined, subtly painterly materials with stable, legible forms and convincing depth; photographic realism is optional. Avoid faceted geometry, plastic surfaces, excessive bloom, distorted columns and dramatic fog. A stationary adult viewer stands on the photographed land-side path, facing the architectural view. Keep the photographed ground plane and lagoon boundary in place. Do not replace water with walkable land or invent a terrace. Preserve an uncluttered nearby land area for separate interactive story objects; do not bake a duplicate bench, photograph, keepsake, person, signage or text into that foreground. Calm static water and architecture. This is an artistic interpretation of present-day place references, not proof of a personal memory or a reconstruction of 1915.`;

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`Invalid ${name}.`);
  return value.trim();
}

export function parsePalaceCapture(value: unknown): PalaceCapture {
  if (!record(value) || value.schema !== 'memory-gate.palace-capture/1') throw new Error('Use a memory-gate.palace-capture/1 manifest.');
  if (!Array.isArray(value.images) || value.images.length < 2 || value.images.length > 4) throw new Error('Choose 2–4 views of the same capture position. Other reference photos stay out of this request.');
  const seen = new Set<string>();
  const images = value.images.map(item => {
    if (!record(item)) throw new Error('Invalid image entry.');
    const file = text(item.file, 'image file', 200);
    if (!/\.(jpe?g|png|webp)$/i.test(file) || /[\\:]/.test(file) || file.startsWith('/') || file.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Image paths must stay inside the capture folder and use JPEG, PNG or WebP.');
    if (seen.has(file)) throw new Error('Each image file must be distinct.');
    seen.add(file);
    const angle = item.azimuthDegrees;
    if (angle !== undefined && (typeof angle !== 'number' || !Number.isFinite(angle) || angle < 0 || angle >= 360)) throw new Error('An optional azimuth must be in [0, 360) degrees. Leave it out when unknown.');
    return { file, ...(typeof angle === 'number' ? { azimuthDegrees: angle } : {}) };
  });
  let measuredReference: PalaceCapture['measuredReference'] = null;
  if (value.measuredReference !== null && value.measuredReference !== undefined) {
    const m = value.measuredReference;
    if (!record(m) || typeof m.meters !== 'number' || !Number.isFinite(m.meters) || m.meters < .05 || m.meters > 20) throw new Error('A measured reference needs a real length between 0.05 and 20 meters.');
    measuredReference = { label: text(m.label, 'measured reference label', 120), meters: m.meters };
  }
  if (typeof value.reviewedForUpload !== 'boolean') throw new Error('Record whether these specific photos were reviewed for upload.');
  return { schema: 'memory-gate.palace-capture/1', title: text(value.title, 'title', 64), capturePosition: text(value.capturePosition, 'capture position', 400),
    rights: text(value.rights, 'photo source and rights', 600), reviewedForUpload: value.reviewedForUpload, images, measuredReference };
}

/** Official multi-image layout, using private uploaded media IDs rather than public family-photo URLs. */
export function palaceWorldRequest(capture: PalaceCapture, mediaIds: string[]) {
  // Validate again at the boundary even when a caller bypasses the parser's TypeScript type.
  const c = parsePalaceCapture(capture);
  if (!c.reviewedForUpload) throw new Error('Review these specific images before preparing a provider request.');
  if (mediaIds.length !== c.images.length || mediaIds.some(id => !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) || new Set(mediaIds).size !== mediaIds.length) throw new Error('Each selected photo needs a distinct World Labs media ID.');
  return { display_name: c.title, model: 'marble-1.1', permission: { public: false, allow_id_access: false }, world_prompt: {
    type: 'multi-image', reconstruct_images: false, text_prompt: PALACE_PROMPT,
    multi_image_prompt: c.images.map((image, i) => ({ ...(image.azimuthDegrees !== undefined ? { azimuth: image.azimuthDegrees } : {}),
      content: { source: 'media_asset', media_asset_id: mediaIds[i]! } })),
  } };
}
