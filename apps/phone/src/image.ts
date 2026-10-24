// Client-side photo normalization: decode (respecting EXIF orientation), scale to ≤2048 px, re-encode as an 8-bit
// sRGB JPEG through a canvas (this also drops EXIF, including any location), and estimate the photo's tone.
export type Tone = 'mono' | 'sepia' | 'muted';
export type Normalized = { blob: Blob; width: number; height: number; tone: Tone; previewUrl: string };

const MAX_SIDE = 2048;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Tone from pixel saturation: near-grey is "mono", low-saturation warm browns are "sepia", anything else "muted". */
export function toneOf(px: Uint8ClampedArray): Tone {
  let satSum = 0, counted = 0, tinted = 0, warm = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    const r = px[i]! / 255, g = px[i + 1]! / 255, b = px[i + 2]! / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max < 0.08 || min > 0.95) continue; // ignore deep shadow and blown highlights
    satSum += max === 0 ? 0 : d / max;
    counted++;
    if (d > 0.03) {
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
      tinted++;
      if (h >= 12 && h <= 58) warm++;
    }
  }
  const meanSat = counted ? satSum / counted : 0;
  if (meanSat < 0.07) return 'mono';
  if (meanSat < 0.42 && tinted > 0 && warm / tinted > 0.72) return 'sepia';
  return 'muted';
}

export async function normalizePhoto(file: Blob): Promise<Normalized> {
  const src = await decode(file);
  const w0 = src.width, h0 = src.height;
  if (!w0 || !h0) throw new Error('empty image');
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#ffffff'; // flatten transparency (PNG scans) before JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  if ('close' in src) src.close();

  const tw = 96, th = Math.max(1, Math.round((96 * height) / width));
  const thumb = document.createElement('canvas');
  thumb.width = tw;
  thumb.height = th;
  const tctx = thumb.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  if (!tctx) throw new Error('no canvas');
  tctx.drawImage(canvas, 0, 0, tw, th);
  const tone = toneOf(tctx.getImageData(0, 0, tw, th).data);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.9));
  return { blob, width, height, tone, previewUrl: URL.createObjectURL(blob) };
}

export const TONE_LABEL: Record<Tone, string> = { mono: 'Black and white', sepia: 'Sepia', muted: 'Faded color' };
