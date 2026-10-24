// Fictional sample memories for the album preview (?preview=album) and visual review. The pictures are painted
// here in code to resemble the experience's porcelain-and-light renders; no photographs, no real people.
import type { AlbumMemory, AlbumMoment } from './types';

type Scene = 'lake' | 'kitchen' | 'garden';
type View = { zoom: number; fx: number; fy: number };
const W = 1600, H = 1000;

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

function vgrad(g: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer = 'rgba(255,255,255,0)') {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function shadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.22) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  glow(g, 0, 0, rx, `rgba(70,62,110,${a})`, 'rgba(70,62,110,0)');
  g.restore();
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
}
/** A porcelain fill: lit from above-left, a little cooler and darker at the base. */
function porcelain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, bottom: string) {
  const gr = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  return gr;
}

function lake(g: CanvasRenderingContext2D, v: number) {
  const r = rng(7 + v);
  g.fillStyle = vgrad(g, 0, H * 0.58, [[0, '#a99fdc'], [0.48, '#e9bfd6'], [0.86, '#fbdcd0'], [1, '#fde9d8']]);
  g.fillRect(0, 0, W, H * 0.58);
  glow(g, W * 0.4, H * 0.55, W * 0.24, 'rgba(255,246,232,0.95)');
  glow(g, W * 0.4, H * 0.55, W * 0.06, 'rgba(255,255,250,1)');
  // far hills
  g.fillStyle = 'rgba(206,192,232,0.92)';
  g.beginPath(); g.moveTo(0, H * 0.56);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, H * 0.5 - Math.sin(x * 0.004) * 22 - Math.sin(x * 0.011 + 2) * 10);
  g.lineTo(W, H * 0.58); g.lineTo(0, H * 0.58); g.fill();
  // far pines on the right shore
  g.fillStyle = 'rgba(176,160,214,0.95)';
  for (let i = 0; i < 26; i++) {
    const x = W * 0.66 + i * 21 + r() * 10, hgt = 50 + r() * 70, base = H * 0.575;
    g.beginPath(); g.moveTo(x, base - hgt); g.quadraticCurveTo(x + 13, base - hgt * 0.4, x + 17, base); g.lineTo(x - 17, base); g.quadraticCurveTo(x - 13, base - hgt * 0.4, x, base - hgt); g.fill();
  }
  // water
  g.fillStyle = vgrad(g, H * 0.575, H, [[0, '#f3d9e2'], [0.5, '#e2d4ea'], [1, '#cfcbe8']]);
  g.fillRect(0, H * 0.575, W, H * 0.43);
  g.strokeStyle = 'rgba(255,250,244,0.55)'; g.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const y = H * 0.585 + Math.pow(r(), 1.6) * H * 0.4, spread = (y - H * 0.57) * 0.9;
    const x = W * 0.4 + (r() - 0.5) * spread * 1.4, len = 8 + r() * 40 * (y / H);
    g.lineWidth = 1 + (y / H) * 2.2; g.globalAlpha = 0.25 + r() * 0.5;
    g.beginPath(); g.moveTo(x - len / 2, y); g.lineTo(x + len / 2, y); g.stroke();
  }
  g.globalAlpha = 1;
  // dock in perspective
  const dock = (t: number) => ({ x: W * (0.6 + t * 0.02), half: W * (0.035 + (1 - t) * 0.15), y: H * (0.64 + (1 - t) * 0.38) });
  const a = dock(1), b = dock(0);
  shadow(g, W * 0.6, H * 0.66, W * 0.06, 8, 0.25);
  g.fillStyle = porcelain(g, b.x - b.half, a.y, b.half * 2, b.y - a.y, '#fbf8f4', '#e7e0ea');
  g.beginPath(); g.moveTo(a.x - a.half, a.y); g.lineTo(a.x + a.half, a.y); g.lineTo(b.x + b.half, b.y); g.lineTo(b.x - b.half, b.y); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(150,138,180,0.28)'; g.lineWidth = 1.4;
  for (let i = 1; i < 16; i++) { const t = 1 - Math.pow(i / 16, 1.6); const p = dock(t); g.beginPath(); g.moveTo(p.x - p.half, p.y); g.lineTo(p.x + p.half, p.y); g.stroke(); }
  g.fillStyle = '#efe7ee';
  for (const t of [0.05, 0.4, 0.75, 0.98]) { const p = dock(t); for (const s of [-1, 1]) { rr(g, p.x + s * p.half - 5 * (1.2 - t), p.y - 2, 10 * (1.2 - t), 26 * (1.3 - t), 4); g.fill(); } }
  // the little red rowboat
  const bx = W * 0.69, by = H * 0.665;
  shadow(g, bx, by + 14, 120, 12, 0.3);
  g.fillStyle = porcelain(g, bx - 110, by - 20, 220, 40, '#f2c3cc', '#d98a99');
  g.beginPath(); g.moveTo(bx - 115, by - 12); g.quadraticCurveTo(bx, by + 34, bx + 115, by - 12); g.quadraticCurveTo(bx, by - 2, bx - 115, by - 12); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(bx - 10, by - 9, 92, 6, 0, 0, Math.PI * 2); g.fill();
  if (v >= 2) {
    for (let i = 0; i < 40; i++) glow(g, r() * W, H * 0.3 + r() * H * 0.5, 6 + r() * 10, 'rgba(255,236,170,0.9)', 'rgba(255,236,170,0)');
  }
}

function kitchen(g: CanvasRenderingContext2D, v: number) {
  const r = rng(11 + v);
  g.fillStyle = vgrad(g, 0, H * 0.72, [[0, '#f7f0e6'], [1, '#efe5d6']]);
  g.fillRect(0, 0, W, H * 0.72);
  g.fillStyle = vgrad(g, H * 0.72, H, [[0, '#ece2d2'], [1, '#e1d5c2']]);
  g.fillRect(0, H * 0.72, W, H * 0.28);
  g.strokeStyle = 'rgba(160,140,110,0.12)'; g.lineWidth = 1.2;
  for (let i = -12; i < 24; i++) { g.beginPath(); g.moveTo(W * 0.5 + i * 110, H); g.lineTo(W * 0.5 + i * 34, H * 0.72); g.stroke(); }
  for (let i = 0; i < 6; i++) { const y = H * 0.72 + Math.pow(i / 6, 1.7) * H * 0.28; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // window and its light
  const wx = W * 0.16, wy = H * 0.14, ww = W * 0.3, wh = H * 0.42;
  g.fillStyle = 'rgba(255,246,222,0.45)';
  g.beginPath(); g.moveTo(wx, wy + wh); g.lineTo(wx + ww, wy + wh); g.lineTo(W * 0.78, H); g.lineTo(W * 0.12, H); g.closePath(); g.fill();
  g.fillStyle = vgrad(g, wy, wy + wh, [[0, '#fffdf6'], [1, '#fff1cf']]); rr(g, wx, wy, ww, wh, 10); g.fill();
  glow(g, wx + ww * 0.5, wy + wh * 0.45, ww * 0.9, 'rgba(255,248,224,0.65)');
  g.strokeStyle = '#fbf8f2'; g.lineWidth = 12; rr(g, wx, wy, ww, wh, 10); g.stroke();
  g.lineWidth = 7; g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
  // yellow curtains
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? wx - 30 : wx + ww + 30;
    g.fillStyle = porcelain(g, x0 - 60, wy - 30, 120, wh + 90, 'rgba(246,226,140,0.95)', 'rgba(232,196,80,0.92)');
    g.beginPath(); g.moveTo(x0, wy - 34);
    g.bezierCurveTo(x0 + side * -70, wy + wh * 0.3, x0 + side * 30, wy + wh * 0.6, x0 + side * -40, wy + wh + 60);
    g.lineTo(x0 + side * 40, wy + wh + 60); g.bezierCurveTo(x0 + side * 60, wy + wh * 0.5, x0 + side * 40, wy, x0 + side * 60, wy - 34); g.closePath(); g.fill();
  }
  g.fillStyle = '#f6f1ea'; rr(g, wx - 70, wy - 44, ww + 140, 14, 7); g.fill();
  // shelf and radio
  g.fillStyle = '#f3ece2'; rr(g, W * 0.64, H * 0.36, W * 0.26, 16, 8); g.fill();
  shadow(g, W * 0.77, H * 0.37, W * 0.12, 8, 0.15);
  g.fillStyle = porcelain(g, W * 0.71, H * 0.36 - 92, 190, 92, '#e2c9a6', '#c9a67e'); rr(g, W * 0.71, H * 0.36 - 92, 190, 92, 18); g.fill();
  g.fillStyle = 'rgba(255,250,240,0.75)'; g.beginPath(); g.arc(W * 0.71 + 62, H * 0.36 - 46, 27, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b8936a'; g.beginPath(); g.arc(W * 0.71 + 138, H * 0.36 - 46, 11, 0, Math.PI * 2); g.fill();
  // table with a bowl of oranges, and two chairs
  const tx = W * 0.58, ty = H * 0.66;
  shadow(g, tx, ty + 150, W * 0.2, 24, 0.24);
  for (const s of [-1, 1]) {
    g.fillStyle = porcelain(g, tx + s * 290 - 60, ty - 120, 120, 260, '#f6f0e9', '#e6ddd2');
    rr(g, tx + s * 300 - 50, ty - 150, 100, 150, 30); g.fill();
    rr(g, tx + s * 300 - 64, ty + 6, 128, 34, 14); g.fill();
    rr(g, tx + s * 300 - 52, ty + 30, 12, 120, 6); g.fill(); rr(g, tx + s * 300 + 40, ty + 30, 12, 120, 6); g.fill();
  }
  g.fillStyle = '#e9d7bd'; for (const s of [-1, 1]) { rr(g, tx + s * 170 - 10, ty + 10, 20, 140, 8); g.fill(); }
  g.fillStyle = porcelain(g, tx - 230, ty - 40, 460, 70, '#f3e6d2', '#ddc6a6');
  g.beginPath(); g.ellipse(tx, ty, 232, 42, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(tx - 30, ty - 10, 170, 20, 0, 0, Math.PI * 2); g.fill();
  const ox = tx + 20, oy = ty - 26;
  for (let i = 0; i < 6; i++) { const ax = ox - 50 + (i % 3) * 42 + r() * 8, ay = oy - 18 - Math.floor(i / 3) * 26; glow(g, ax, ay, 24, 'rgba(246,176,118,1)', 'rgba(236,150,92,0.95)'); glow(g, ax - 7, ay - 8, 8, 'rgba(255,236,214,0.9)'); }
  g.fillStyle = porcelain(g, ox - 80, oy - 20, 160, 46, '#ffffff', '#e8e4f0');
  g.beginPath(); g.moveTo(ox - 82, oy - 14); g.quadraticCurveTo(ox, oy + 44, ox + 82, oy - 14); g.closePath(); g.fill();
  for (let i = 0; i < 70; i++) glow(g, wx + r() * W * 0.55, wy + r() * H * 0.8, 1.5 + r() * 2.5, 'rgba(255,250,236,0.95)');
}

function garden(g: CanvasRenderingContext2D, v: number) {
  const r = rng(23 + v);
  g.fillStyle = vgrad(g, 0, H * 0.6, [[0, '#e6efec'], [1, '#f7f7f2']]);
  g.fillRect(0, 0, W, H * 0.6);
  g.fillStyle = 'rgba(214,230,216,0.9)';
  for (let i = 0; i < 18; i++) glow(g, i * 100 + r() * 60, H * 0.56, 90 + r() * 50, 'rgba(206,224,206,0.95)', 'rgba(206,224,206,0)');
  g.fillStyle = vgrad(g, H * 0.58, H, [[0, '#e5eedb'], [1, '#d8e4cb']]);
  g.fillRect(0, H * 0.58, W, H * 0.42);
  // picket fence
  for (let i = 0; i < 40; i++) { const x = i * 44 - 10; g.fillStyle = porcelain(g, x, H * 0.5, 22, 90, '#fdfcfa', '#ece9e4'); rr(g, x, H * 0.5, 22, 92, 10); g.fill(); }
  g.fillStyle = '#f4f2ee'; rr(g, 0, H * 0.53, W, 12, 6); g.fill(); rr(g, 0, H * 0.57, W, 12, 6); g.fill();
  // the tree
  const cx = W * 0.3, cy = H * 0.3;
  shadow(g, cx + 30, H * 0.78, 260, 40, 0.22);
  g.fillStyle = porcelain(g, cx - 20, cy, 50, H * 0.5, '#e5d6c4', '#cdb79f'); rr(g, cx - 22, cy + 60, 46, H * 0.42, 22); g.fill();
  const greens = ['#cfe0c2', '#bdd3ad', '#dbe8cf', '#c6dab7'];
  for (let i = 0; i < 46; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 230; glow(g, cx + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.62, 70 + r() * 50, greens[i % 4]!, 'rgba(200,220,190,0)'); }
  for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 180; glow(g, cx + Math.cos(a) * d - 40, cy + Math.sin(a) * d * 0.5 - 50, 30 + r() * 20, 'rgba(244,250,238,0.85)'); }
  // bench under the tree
  const bx = W * 0.36, by = H * 0.74;
  shadow(g, bx, by + 70, 180, 18, 0.25);
  g.fillStyle = porcelain(g, bx - 170, by - 90, 340, 160, '#fbf9f6', '#e9e5df');
  rr(g, bx - 170, by - 92, 340, 26, 12); g.fill(); rr(g, bx - 170, by - 56, 340, 26, 12); g.fill(); rr(g, bx - 180, by - 4, 360, 30, 14); g.fill();
  rr(g, bx - 160, by + 20, 18, 60, 8); g.fill(); rr(g, bx + 142, by + 20, 18, 60, 8); g.fill();
  // flower bed
  const tones = ['#f1bccb', '#f6ead0', '#dccbf1', '#f4c9a8'];
  for (let i = 0; i < 260; i++) { const x = W * 0.58 + r() * W * 0.4, y = H * 0.66 + Math.pow(r(), 0.8) * H * 0.3; glow(g, x, y, 7 + r() * 9, tones[i % 4]!, 'rgba(255,255,255,0)'); }
  for (let i = 0; i < 30; i++) { g.save(); g.translate(r() * W, r() * H * 0.7); g.rotate(r() * 3); g.fillStyle = 'rgba(242,190,204,0.8)'; g.beginPath(); g.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
}

function paint(scene: Scene, view: View, variant: number): string {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 820;
  const g = c.getContext('2d')!;
  const k = (c.width / W) * Math.max(1.05, view.zoom);
  const halfW = c.width / 2 / k, halfH = c.height / 2 / k;
  const cx = Math.min(W - halfW, Math.max(halfW, view.fx * W)), cy = Math.min(H - halfH, Math.max(halfH, view.fy * H));
  g.setTransform(k, 0, 0, k, c.width / 2 - cx * k, c.height / 2 - cy * k);
  g.fillStyle = scene === 'lake' ? '#e2d4ea' : scene === 'kitchen' ? '#ece2d2' : '#e2ebd6';
  g.fillRect(-200, -200, W + 400, H + 400);
  if (scene === 'lake') lake(g, variant); else if (scene === 'kitchen') kitchen(g, variant); else garden(g, variant);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // a breath of aurora light and fine grain, as in the renders
  const tint = g.createLinearGradient(0, 0, c.width, c.height);
  tint.addColorStop(0, 'rgba(190,170,255,0.06)'); tint.addColorStop(1, 'rgba(120,240,200,0.05)');
  g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
  const r = rng(99 + variant);
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,30,70,0.035)'; g.fillRect(r() * c.width, r() * c.height, 1.2, 1.2); }
  return c.toDataURL('image/jpeg', 0.9);
}

/** A soft two-note chime as a WAV (stands in for a recorded voice in the sample). */
function chime(): string {
  const rate = 22050, n = Math.floor(rate * 1.8);
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const s = Math.sin(2 * Math.PI * 659.25 * t) * Math.exp(-t * 2.4) + 0.7 * Math.sin(2 * Math.PI * 987.77 * Math.max(0, t - 0.32)) * Math.exp(-Math.max(0, t - 0.32) * 2.6) * (t > 0.32 ? 1 : 0);
    data[i] = Math.round(Math.max(-1, Math.min(1, s * 0.35)) * 32767);
  }
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(data);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function sampleMemories(now = Date.now()): AlbumMemory[] {
  const voice = chime();
  const hour = 3_600_000;
  const mk = (memoryId: string, memoryTitle: string, at: number, items: [AlbumMoment['kind'], AlbumMoment['speaker'], string, string, boolean][], sourceUrl: string | null): AlbumMoment[] =>
    items.map(([kind, speaker, caption, image, audio], i) => ({ id: `${memoryId}-${i}`, memoryId, memoryTitle, caption, speaker, at: at + i * 95_000, imageUrl: image, sourceUrl, audioUrl: audio ? voice : null, kind }));

  const lakeAt = now - 0.6 * hour;
  const kitchenAt = now - 2.4 * hour;
  const gardenAt = now - 26 * hour;
  const kitchenPhoto = paint('kitchen', { zoom: 1.0, fx: 0.42, fy: 0.5 }, 9);
  return [
    { id: 'sample-lake', title: 'The lake at dusk', at: lakeAt, source: 'words', palette: ['#d98a99', '#a99fdc'], sample: true, moments: mk('sample-lake', 'The lake at dusk', lakeAt, [
      ['arrival', 'companion', 'Here we are. The water is so still, and the dock reaches out toward the last of the light.', paint('lake', { zoom: 1, fx: 0.5, fy: 0.55 }, 0), false],
      ['detail', 'you', 'There was a little red rowboat tied at the end of the dock. Dad painted it every spring.', paint('lake', { zoom: 1.7, fx: 0.68, fy: 0.64 }, 1), true],
      ['detail', 'you', 'We stayed out until the fireflies came.', paint('lake', { zoom: 1.25, fx: 0.42, fy: 0.5 }, 2), true],
      ['final', 'companion', 'Thank you for bringing me here. I’ve kept this evening for you.', paint('lake', { zoom: 1.05, fx: 0.56, fy: 0.6 }, 3), false],
    ], null) },
    { id: 'sample-kitchen', title: 'Grandma’s kitchen', at: kitchenAt, source: 'photo', palette: ['#e8c547', '#d9c7a6'], sample: true, moments: mk('sample-kitchen', 'Grandma’s kitchen', kitchenAt, [
      ['arrival', 'companion', 'Grandma’s kitchen, with the yellow curtains catching the morning.', paint('kitchen', { zoom: 1, fx: 0.48, fy: 0.5 }, 0), false],
      ['detail', 'you', 'The radio was always on, right there on the shelf.', paint('kitchen', { zoom: 1.8, fx: 0.77, fy: 0.33 }, 1), true],
      ['detail', 'you', 'And a bowl of oranges on the table. She’d peel one for me after school.', paint('kitchen', { zoom: 1.6, fx: 0.6, fy: 0.62 }, 2), true],
    ], kitchenPhoto) },
    { id: 'sample-garden', title: 'The garden in June', at: gardenAt, source: 'video', palette: ['#9caf88', '#f1bccb'], sample: true, moments: mk('sample-garden', 'The garden in June', gardenAt, [
      ['arrival', 'companion', 'The garden in June. Everything is in bloom.', paint('garden', { zoom: 1, fx: 0.5, fy: 0.52 }, 0), false],
      ['detail', 'you', 'The bench under the big tree was where we had lemonade.', paint('garden', { zoom: 1.5, fx: 0.34, fy: 0.62 }, 1), true],
      ['final', 'companion', 'It was lovely to sit here with you.', paint('garden', { zoom: 1.2, fx: 0.7, fy: 0.62 }, 2), false],
    ], null) },
  ];
}
