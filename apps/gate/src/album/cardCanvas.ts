// The album's panes, painted for the headset: each is one canvas (the place's picture, a frosted plate with its name
// and a short line), so in 3D every pane is a single quad. The album's own type: Instrument Serif for names, Atkinson
// Hyperlegible Next for words. Pictures load once, at a sensible size, and a pane that can't load its picture keeps a
// soft wash of its colour instead.
import { memoryLine, momentLabel } from './format';
import type { AlbumMemory, AlbumMoment } from './types';

const SERIF = '"Instrument Serif", "Iowan Old Style", Georgia, serif';
const SANS = '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", system-ui, sans-serif';
const INK = '#1d1c2e';
const INK_SOFT = 'rgba(29, 28, 46, 0.64)';
const PAPER = '#f1f2f7';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let fonts: Promise<unknown> | null = null;
/** The page already uses these faces; a canvas can only draw with them once they're loaded (bounded wait). */
export function fontsReady(): Promise<unknown> {
  fonts ??= Promise.race([
    Promise.all([`400 60px ${SERIF}`, `italic 400 32px ${SERIF}`, `400 26px ${SANS}`, `600 22px ${SANS}`].map((f) => document.fonts?.load(f).catch(() => undefined))),
    sleep(2000),
  ]);
  return fonts;
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
/** A picture for a pane: decoded once, kept for the visit (a missing or blocked one resolves to null). */
export function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let p = images.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      if (!/^(blob|data):/.test(url)) img.crossOrigin = 'anonymous'; // a canvas the headset draws must stay untainted
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, p);
    if (images.size > 24) images.delete(images.keys().next().value!);
  }
  return p;
}

/** The picture a memory shows first: its arrival, else the first moment with a picture. */
export function coverOf(m: AlbumMemory): AlbumMoment | null {
  return m.moments.find((x) => x.kind === 'arrival' && x.imageUrl) ?? m.moments.find((x) => x.imageUrl) ?? m.moments[0] ?? null;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw `img` to cover the rectangle (cropped from its centre). */
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** A soft wash of the memory's colour, where its picture would be. */
function wash(ctx: CanvasRenderingContext2D, tint: string, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, '#e9e7f5');
  g.addColorStop(1, tint);
  ctx.fillStyle = PAPER;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  const r = ctx.createRadialGradient(x + w * 0.3, y + h * 0.25, 0, x + w * 0.3, y + h * 0.25, w * 0.7);
  r.addColorStop(0, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(x, y, w, h);
}

/** Lines of `text` that fit `width`, at most `max` of them (the last one ends in an ellipsis when cut). */
export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(next).width <= width || !line) { line = next; continue; }
    lines.push(line);
    line = words[i]!;
    if (lines.length === max) { line = ''; break; }
  }
  if (line) lines.push(line);
  const cut = lines.length > max || (lines.length === max && lines.join(' ').split(' ').length < words.length);
  const out = lines.slice(0, max);
  if (cut && out.length) {
    let last = out[out.length - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1).trimEnd();
    out[out.length - 1] = `${last.replace(/[,.;:]$/, '')}…`;
  }
  return out;
}

/** The pane's frosted plate: the picture beneath it softened, white glass over it, a bright top edge. */
function plate(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, tint: string, card: [number, number, number, number], x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  rounded(ctx, x, y, w, h, r);
  ctx.clip();
  if (img) {
    ctx.filter = 'blur(18px) saturate(1.6)';
    cover(ctx, img, card[0], card[1], card[2], card[3]);
    ctx.filter = 'none';
  } else wash(ctx, tint, card[0], card[1], card[2], card[3]);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0.66)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.save();
  rounded(ctx, x + 1, y + 1, w - 2, h - 2, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export const CARD = { w: 768, h: 576 };

/** One memory as a pane: its picture full-bleed, the plate at the bottom with its name and a line, "Sample" if it is one.
 *  Sized for reading at arm's length and a half: the name about 1.7° tall, the line about 0.75°. */
export function paintCard(ctx: CanvasRenderingContext2D, m: AlbumMemory, img: HTMLImageElement | null) {
  const { w: W, h: H } = CARD;
  const tint = m.palette[0] ?? '#b9a6ff';
  ctx.clearRect(0, 0, W, H);
  if (img) { ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H); cover(ctx, img, 0, 0, W, H); } else wash(ctx, tint, 0, 0, W, H);
  // A breath of light across the top of the glass.
  const sheen = ctx.createLinearGradient(0, 0, 0, H * 0.35);
  sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  ctx.font = `400 33px ${SANS}`;
  const pw = W - 40, lines = wrap(ctx, memoryLine(m), pw - 56, 2);
  const ph = 30 + 76 + 14 + lines.length * 41 + 20;
  const px = 20, py = H - 20 - ph;
  plate(ctx, img, tint, [0, 0, W, H], px, py, pw, ph, 32);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `400 80px ${SERIF}`;
  ctx.fillText(wrap(ctx, m.title, pw - 56, 1)[0] ?? '', px + 28, py + 30 + 62);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `400 33px ${SANS}`;
  lines.forEach((line, i) => ctx.fillText(line, px + 28, py + 30 + 76 + 14 + 28 + i * 41));
  if (m.sample) {
    ctx.font = `600 27px ${SANS}`;
    const tw = ctx.measureText('Sample').width;
    rounded(ctx, 26, 26, tw + 40, 50, 25);
    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText('Sample', 46, 61);
  }
  // The bright rim of the pane.
  ctx.save();
  rounded(ctx, 2, 2, W - 4, H - 4, 44);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 4;
  ctx.stroke();
  rounded(ctx, 6, 6, W - 12, H - 12, 40);
  ctx.strokeStyle = 'rgba(190,240,224,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export const DETAIL = { w: 1280, h: 720 };
export type DetailLayout = { rows: { index: number; y0: number; y1: number }[]; textX: number };

/** A memory brought forward: its picture on the left, and on the right its name, when and how, and its moments' words
 *  (the chosen one marked). Returns where each moment's row is, so pointing at one can choose it. */
export function paintDetail(ctx: CanvasRenderingContext2D, m: AlbumMemory, chosen: number, img: HTMLImageElement | null): DetailLayout {
  const { w: W, h: H } = DETAIL;
  const tint = m.palette[0] ?? '#b9a6ff';
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f6f6fa';
  ctx.fillRect(0, 0, W, H);
  const pic = { x: 24, y: 24, w: 620, h: H - 48 };
  ctx.save();
  rounded(ctx, pic.x, pic.y, pic.w, pic.h, 30);
  ctx.clip();
  if (img) cover(ctx, img, pic.x, pic.y, pic.w, pic.h); else wash(ctx, tint, pic.x, pic.y, pic.w, pic.h);
  ctx.restore();
  ctx.save();
  rounded(ctx, pic.x, pic.y, pic.w, pic.h, 30);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  const x = pic.x + pic.w + 44, tw = W - x - 40;
  let y = 30 + 56;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `400 64px ${SERIF}`;
  for (const line of wrap(ctx, m.title, tw, 2)) { ctx.fillText(line, x, y); y += 62; }
  ctx.fillStyle = INK_SOFT;
  ctx.font = `400 26px ${SANS}`;
  y -= 18;
  for (const line of wrap(ctx, memoryLine(m), tw, 2)) { ctx.fillText(line, x, y); y += 34; }
  y += 10;
  const rows: DetailLayout['rows'] = [];
  for (const [i, mo] of m.moments.slice(0, 5).entries()) {
    const said = mo.speaker === 'companion' ? `italic 400 32px ${SERIF}` : `400 28px ${SANS}`;
    ctx.font = said;
    const lines = wrap(ctx, mo.caption, tw - 24, i === chosen ? 3 : 1); // the chosen moment says it all; the others a line
    const h = 18 + 26 + lines.length * 36 + 16;
    if (y + h > H - 18) break;
    const y0 = y;
    if (i === chosen) {
      rounded(ctx, x - 16, y0, tw + 30, h, 18);
      ctx.fillStyle = 'rgba(29, 28, 46, 0.065)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 3, y0 + 33, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = tint;
      ctx.fill();
    }
    ctx.fillStyle = INK_SOFT;
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText(momentLabel(mo), x + 12, y0 + 18 + 22);
    ctx.fillStyle = INK;
    ctx.font = said;
    lines.forEach((line, k) => ctx.fillText(line, x + 12, y0 + 18 + 26 + 28 + k * 36));
    rows.push({ index: i, y0, y1: y0 + h });
    y += h + 6;
  }
  // The rim.
  ctx.save();
  rounded(ctx, 2, 2, W - 4, H - 4, 40);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
  return { rows, textX: x };
}
