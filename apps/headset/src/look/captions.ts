// Spatial captions: a warm, dark, softly bordered card below the line of sight, set in a serif at a size an older
// reader can manage in the headset (~1.4 degrees x-height at 1.15 m). Shows who spoke and when, the words in the
// speaker's own language, and an optional translation line. Never occluded (depthTest off, drawn last: 2000).
// Captions appear whole and stay still while shown; they fade in/out over ~0.5 s.
import * as THREE from 'three';
import { BRASS, INK } from './palette.js';

const W = 2048, H = 640, PLANE_W = 0.84;
const SERIF = 'Georgia, "Iowan Old Style", "Noto Serif", serif';

const _head = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _want = new THREE.Vector3();

export class Captions {
  readonly mesh: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private mat: THREE.MeshBasicMaterial;
  private opacity = 0;
  private hold = 0;
  private age = 0;
  private placed = false;
  private pinned = false;
  /** Vertical offset below eye height (m). XR: -0.34 (below the line of sight); the 2D page raises it above its panel. */
  drop = -0.34;
  /** 1 shown, 0 hidden (pause). */
  visibleTarget = 1;
  private vis = 1;
  /** The text currently on the card (for tests and the 2D mirror). */
  current: { speaker: string; text: string; translation?: string } | null = null;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_W, (PLANE_W * H) / W), this.mat);
    this.mesh.renderOrder = 2000;
    this.mesh.visible = false;
  }

  private wrap(text: string, maxW: number): string[] {
    const words = text.split(/\s+/), lines: string[] = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (this.ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Show a card. `holdS` overrides the reading time; `pinned` keeps it until hide() or the next show(). */
  show(speaker: string, text: string, translation?: string | null, opts: { holdS?: number; pinned?: boolean } = {}): void {
    const c = this.ctx, pad = 76, maxW = W - pad * 2;
    this.current = { speaker, text, ...(translation ? { translation } : {}) };
    c.clearRect(0, 0, W, H);
    c.font = `400 68px ${SERIF}`;
    let lines = this.wrap(text, maxW);
    if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = `${lines[2]!.replace(/[\s.,;:!?]+$/, '')}…`; }
    c.font = `italic 400 46px ${SERIF}`;
    const tlines = translation ? this.wrap(translation, maxW).slice(0, 2) : [];
    const h = 64 + 52 + lines.length * 86 + (tlines.length ? 18 + tlines.length * 60 : 0) + 46;
    const y0 = Math.max(4, (H - h) / 2);
    // card
    c.beginPath(); c.roundRect(4, y0, W - 8, Math.min(h, H - 8), 44);
    const bg = c.createLinearGradient(0, y0, 0, y0 + h);
    bg.addColorStop(0, 'rgba(34,24,15,0.84)'); bg.addColorStop(1, 'rgba(18,12,8,0.84)');
    c.fillStyle = bg; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,214,160,0.18)'; c.stroke();
    // speaker label with a small brass source dot
    let y = y0 + 64 + 30;
    c.fillStyle = BRASS;
    c.beginPath(); c.arc(pad + 10, y - 12, 10, 0, Math.PI * 2); c.fill();
    c.font = `600 34px ${SERIF}`;
    (c as unknown as { letterSpacing: string }).letterSpacing = '5px';
    c.fillText(speaker.toUpperCase(), pad + 36, y);
    (c as unknown as { letterSpacing: string }).letterSpacing = '0px';
    y += 30;
    c.fillStyle = INK; c.font = `400 68px ${SERIF}`;
    for (const l of lines) { y += 86; c.fillText(l, pad, y - 14); }
    if (tlines.length) {
      y += 18;
      c.fillStyle = '#cdb994'; c.font = `italic 400 46px ${SERIF}`;
      for (const l of tlines) { y += 60; c.fillText(l, pad, y - 10); }
    }
    this.tex.needsUpdate = true;
    this.age = 0;
    this.pinned = !!opts.pinned;
    this.hold = opts.holdS ?? 2.6 + 0.06 * (text.length + (translation?.length ?? 0) * 0.5);
  }

  hide(): void { this.pinned = false; this.hold = 0; }

  /** Unpin the current card and let it stay `afterS` more seconds before fading. */
  release(afterS: number): void { if (this.pinned) { this.pinned = false; this.hold = this.age + afterS; } }

  get isShowing(): boolean { return this.opacity > 0.05 && (this.pinned || this.age < this.hold); }

  update(dt: number, camera: THREE.Object3D): void {
    camera.getWorldPosition(_head); camera.getWorldQuaternion(_q);
    const yaw = _e.setFromQuaternion(_q, 'YXZ').y;
    this.age += dt;
    this.vis += (this.visibleTarget - this.vis) * Math.min(1, dt * 2.2);
    const fadingOut = !this.pinned && this.age > this.hold;
    const target = (fadingOut ? 0 : 1) * this.visibleTarget;
    this.opacity += (target - this.opacity) * Math.min(1, dt * (target > this.opacity ? 3.2 : 2.2));
    this.mat.opacity = this.opacity * Math.min(1, this.vis * 1.2);
    this.mesh.visible = this.mat.opacity > 0.003;
    if (!this.mesh.visible) { this.placed = false; return; }
    // Below the line of sight at 1.15 m, upright, facing the reader; follows lazily (never head-locked).
    _want.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(1.15).add(_head);
    _want.y += this.drop;
    if (!this.placed) { this.mesh.position.copy(_want); this.placed = true; }
    this.mesh.position.lerp(_want, 1 - Math.exp(-dt / 0.6));
    this.mesh.rotation.set(0, yaw, 0);
  }
}
