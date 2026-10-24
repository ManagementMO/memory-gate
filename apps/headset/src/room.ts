// The splat room: one SplatMesh per active splat URL, graded by roomGrade and revealed outward from the photo's
// camera. A new URL loads beside the old one and cross-fades in when ready. Placement: OpenCV → three.js with
// quaternion (1,0,0,0); the splat floor lands on y = 0 of the memory root (position.y = -floorY * scale).
// Spark settings follow the Quest-tested setup (V14): maxStdDev √5, lodCleanupTimeoutMs Infinity, forceSinglePass,
// raycastable false (never raycast the splat per frame).
import * as THREE from '@iwsdk/core';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { applyRoomGrade, type RoomGrade } from './look/roomGrade.js';
import { easeInOutCubic, easeOutCubic } from './look/palette.js';
import { roomPresentation } from './look/worldPresentation.js';

export type SplatInfo = { url: string; floorY: number | null; scale: number; source: string; numSplats: number;
  /** false when only the variant changes (full ↔ lite of the same memory): cross-fade without replaying the reveal */
  reveal?: boolean };

type Loaded = { mesh: SplatMesh; grade: RoomGrade; radius: number; url: string; ready: boolean; revealT: number; fade: number; dying: boolean };

const DEFAULT_EYE = 1.2; // when a splat has no floor estimate: the photo camera at a seated eye height

export function makeSpark(renderer: THREE.WebGLRenderer): SparkRenderer {
  const spark = new SparkRenderer({ renderer, maxStdDev: Math.sqrt(5), lodCleanupTimeoutMs: Infinity });
  const mat = (spark as unknown as { material?: THREE.Material }).material;
  if (mat) mat.forceSinglePass = true;
  return spark;
}

export class SplatRoom {
  readonly root = new THREE.Group();
  private items: Loaded[] = [];
  private pause = 1;
  private paused = false;
  info: SplatInfo | null = null;
  loadMs: number | null = null;
  error: string | null = null;
  onReady: ((ms: number, revealed: boolean) => void) | null = null;

  constructor() { this.root.name = 'splat-room'; }

  /** Height of the photo camera above the splat floor, in meters (the desktop camera sits there). */
  get eyeHeight(): number {
    const i = this.info;
    return i && i.floorY !== null ? -i.floorY * i.scale : DEFAULT_EYE;
  }

  get ready(): boolean { return this.items.some((i) => i.ready && !i.dying); }
  get revealing(): boolean { return this.items.some((i) => i.ready && !i.dying && i.revealT < 3.6); }

  clear(): void {
    for (const item of this.items) item.dying = true;
    this.info = null;
    this.error = null;
    this.loadMs = null;
  }

  load(info: SplatInfo): void {
    // rooms.get re-fires every heartbeat: match against EVERY live item (shown or still loading), and drop pending
    // loads of other URLs so a quick lite on→off ends on the requested file.
    const live = this.items.filter((i) => !i.dying);
    const want = live.find((i) => i.url === info.url);
    if (want) {
      this.info = info;
      for (const o of live) if (o !== want && !o.ready) o.dying = true;
      return;
    }
    this.info = info;
    this.error = null;
    const t0 = performance.now();
    const mesh = new SplatMesh({ url: info.url, raycastable: false } as ConstructorParameters<typeof SplatMesh>[0]);
    mesh.quaternion.set(1, 0, 0, 0); // OpenCV (x right, y down, z forward) → three.js
    mesh.scale.setScalar(info.scale);
    mesh.position.set(0, info.floorY !== null ? -info.floorY * info.scale : DEFAULT_EYE, 0);
    mesh.opacity = 0;
    const look = roomPresentation(info.source, info.scale);
    const grade = applyRoomGrade(mesh, look);
    const item: Loaded = { mesh, grade, radius: look.revealRadius, url: info.url, ready: false, revealT: info.reveal === false ? 3.4 : 0, fade: 0, dying: false };
    this.items.push(item);
    this.root.add(mesh);
    mesh.initialized.then(() => {
      if (item.dying) return;
      item.ready = true;
      this.loadMs = Math.round(performance.now() - t0);
      for (const o of this.items) if (o !== item) o.dying = true; // cross-fade the previous memory out
      this.onReady?.(this.loadMs, info.reveal !== false);
    }).catch((e: unknown) => {
      this.error = String((e as Error)?.message ?? e).slice(0, 160);
      item.dying = true;
    });
  }

  /** One raycast against the active splat (at push-to-talk release only; never per frame). World-space ray in,
   * nearest splat hit out. Spark's raycast is a WASM ray/ellipsoid test over every splat (~tens of ms at 500k). */
  raycastOnce(origin: THREE.Vector3, dir: THREE.Vector3, far = 15): { distance: number; point: THREE.Vector3; ms: number } | null {
    const item = this.items.find((i) => i.ready && !i.dying);
    if (!item) return null;
    const t0 = performance.now();
    const rc = new THREE.Raycaster(origin.clone(), dir.clone().normalize(), 0.3, far);
    const hits: { distance: number; point: THREE.Vector3 }[] = [];
    const mesh = item.mesh as SplatMesh & { raycastable: boolean };
    const was = mesh.raycastable;
    mesh.raycastable = true;
    try { mesh.updateMatrixWorld(true); mesh.raycast(rc, hits as never); } catch { /* treat as no hit */ } finally { mesh.raycastable = was; }
    const ms = Math.round(performance.now() - t0);
    let best: { distance: number; point: THREE.Vector3 } | null = null;
    for (const h of hits) if (!best || h.distance < best.distance) best = h;
    return best ? { distance: best.distance, point: best.point, ms } : null;
  }

  /** Replay the "memory forming" reveal (each time a memory opens). */
  replayReveal(): void { for (const i of this.items) if (i.ready && !i.dying) i.revealT = 0; }

  setPaused(p: boolean): void { this.paused = p; }

  update(dt: number): void {
    // Pause: fade every splat to 0 over ~1.5 s, then visible = false; resume restores.
    const target = this.paused ? 0 : 1;
    this.pause = target > this.pause ? Math.min(1, this.pause + dt / 1.5) : Math.max(0, this.pause - dt / 1.5);
    const pk = easeInOutCubic(this.pause);
    for (let n = this.items.length - 1; n >= 0; n--) {
      const i = this.items[n]!;
      if (i.dying) {
        i.fade = Math.max(0, i.fade - dt / 1.2);
        if (i.fade <= 0) { this.root.remove(i.mesh); i.mesh.dispose(); this.items.splice(n, 1); continue; }
      } else if (i.ready) {
        i.fade = Math.min(1, i.fade + dt / 0.8);
        if (!this.paused && i.revealT < 3.6) {
          i.revealT += dt;
          i.grade.reveal.value = 0.2 + (i.radius - 0.2) * easeOutCubic(Math.min(1, i.revealT / 3.4));
          i.mesh.updateVersion();
        }
      }
      i.mesh.opacity = i.fade * pk;
      i.mesh.visible = i.mesh.opacity > 0.01;
    }
  }
}
