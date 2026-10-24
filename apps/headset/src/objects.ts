// Spoken objects from the backend list → one MemoryObject each. The record decides everything; this layer only
// reconciles: new record → ghost (or solid if already confirmed), ghost ↔ confirmed, glbUrl change while a ghost →
// cross-dissolve, missing from the list (undone or rejected) → dissolve out. Placement is the record's anchor and is
// never changed here. Size = record.size (largest dimension); yaw = record.yaw (library facing) inside a root that
// turns the model's front toward the viewer at the memory-root origin.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FunctionReturnType } from 'convex/server';
import { MemoryObject } from './look/memoryObject.js';
import type { Motes } from './look/motes.js';
import { fileUrl, type Api } from './net.js';

export type ObjectRecord = FunctionReturnType<Api['objects']['list']>[number];

type RenderRecord = ObjectRecord & { previewOnly?: boolean };
type Entry = {
  rec: RenderRecord;
  view: MemoryObject | null;
  shownUrl: string | null; // the glbUrl the current body was built from (null = placeholder)
  loading: string | null; // glbUrl being fetched
  removed: boolean;
};

/** Yaw that turns +Z (the model's front after its library yawOffset) toward the memory-root origin. */
export function faceOrigin(x: number, z: number): number {
  return Math.hypot(x, z) < 1e-4 ? 0 : Math.atan2(-x, -z);
}

export class ObjectLayer {
  readonly root = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** Entries dissolving out: kept updating (and disposed) here, so an object that comes back gets a fresh entry. */
  private leaving = new Set<Entry>();
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<THREE.Object3D>>();
  private first = true;
  private paused = false;
  readonly loadTimes: { url: string; ms: number }[] = [];
  /** Live models that arrived while their object was still a ghost (cross-dissolves). */
  swaps = 0;
  onError: ((msg: string) => void) | null = null;
  onViewReady: ((record: ObjectRecord, view: MemoryObject) => void) | null = null;
  onViewDisposed: ((id: string) => void) | null = null;

  constructor(private motes: Motes) { this.root.name = 'memory-objects'; }

  private model(url: string): Promise<THREE.Object3D> {
    let p = this.cache.get(url);
    if (!p) {
      const t0 = performance.now();
      p = this.loader.loadAsync(fileUrl(url) ?? url).then((g) => { this.loadTimes.push({ url, ms: Math.round(performance.now() - t0) }); return g.scene; });
      p.catch(() => this.cache.delete(url));
      this.cache.set(url, p);
    }
    return p.then((s) => s.clone(true));
  }

  sync(list: ObjectRecord[]): void {
    const seen = new Set<string>();
    const initial = this.first;
    this.first = false;
    const renderList: RenderRecord[] = [];
    for (const rec of list) {
      renderList.push(rec);
      if (rec.pendingCorrection) renderList.push({ ...rec,
        id: `preview-${rec.pendingCorrection.id}` as ObjectRecord['id'], previewOnly: true, status: 'ghost',
        anchor: rec.pendingCorrection.anchor, facingYaw: rec.pendingCorrection.facingYaw, pendingCorrection: null });
    }
    for (const rec of renderList) {
      seen.add(rec.id);
      let e = this.entries.get(rec.id);
      if (!e) {
        e = { rec, view: null, shownUrl: null, loading: null, removed: false };
        this.entries.set(rec.id, e);
        this.build(e, initial);
        continue;
      }
      const prev = e.rec;
      e.rec = rec;
      if (!e.view) continue; // still loading: build() reads e.rec when the model arrives
      const spec = this.spec(rec);
      e.view.setPlacement(spec.position, spec.rootYaw);
      if (prev.status === 'ghost' && rec.status === 'confirmed') e.view.confirm();
      else if (prev.status === 'confirmed' && rec.status === 'ghost') e.view.unconfirm();
      if (rec.status === 'ghost' && rec.glbUrl !== e.shownUrl && rec.glbUrl && rec.glbUrl !== e.loading) this.swap(e, rec.glbUrl);
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      e.removed = true;
      this.entries.delete(id); // a later return builds a fresh entry; this one finishes dissolving from `leaving`
      if (e.view) { this.leaving.add(e); e.view.remove(() => { this.onViewDisposed?.(id); e.view?.dispose(); this.leaving.delete(e); }); }
    }
  }

  private spec(rec: ObjectRecord) {
    const [x = 0, y = 0, z = 0] = rec.anchor.position;
    return { id: rec.id, label: rec.label, size: rec.size > 0 ? rec.size : 0.6, position: new THREE.Vector3(x, y, z), rootYaw: rec.facingYaw ?? faceOrigin(x, z) };
  }

  private build(e: Entry, _initial: boolean): void {
    const rec = e.rec;
    const make = (model: THREE.Object3D | null, url: string | null) => {
      if (e.removed || e.view) return;
      const r = e.rec; // latest state
      e.shownUrl = url;
      e.view = new MemoryObject(this.spec(r), { model, size: r.size > 0 ? r.size : 0.6, modelYaw: r.yaw }, this.motes,
        { confirmed: r.status === 'confirmed' });
      e.view.setPaused(this.paused);
      this.root.add(e.view.root);
      this.onViewReady?.(r, e.view);
      // The live model may have arrived while we were building the placeholder.
      if (r.status === 'ghost' && r.glbUrl && r.glbUrl !== url) this.swap(e, r.glbUrl);
    };
    if (!rec.glbUrl) { make(null, null); return; }
    const url = rec.glbUrl;
    e.loading = url;
    this.model(url).then((m) => { e.loading = null; make(m, url); }).catch(() => {
      e.loading = null;
      this.onError?.(`Couldn't load the ${rec.label} model; showing a soft placeholder.`);
      make(null, null);
    });
  }

  private swap(e: Entry, url: string): void {
    e.loading = url;
    this.model(url).then((m) => {
      e.loading = null;
      if (e.removed || !e.view || e.rec.status !== 'ghost' || e.rec.glbUrl !== url) return; // never swap after confirm
      e.view.swapModel({ model: m, size: e.rec.size > 0 ? e.rec.size : 0.6, modelYaw: e.rec.yaw });
      e.shownUrl = url;
      this.swaps++;
    }).catch(() => { e.loading = null; });
  }

  setPaused(p: boolean): void {
    this.paused = p;
    for (const e of this.entries.values()) e.view?.setPaused(p);
    for (const e of this.leaving) e.view?.setPaused(p);
  }

  update(dt: number, time: number, viewer: THREE.Object3D): void {
    for (const e of this.entries.values()) e.view?.update(dt, time, viewer);
    for (const e of this.leaving) e.view?.update(dt, time, viewer);
  }

  /** Confirmed objects under a ray (meshes only; the splat is never raycast). */
  pick(ray: THREE.Raycaster): ObjectRecord | null {
    const meshes: THREE.Object3D[] = [];
    const owner = new Map<THREE.Object3D, Entry>();
    for (const e of this.entries.values()) {
      if (!e.view || e.removed || e.rec.status !== 'confirmed') continue;
      const before = meshes.length;
      e.view.pickMeshes(meshes);
      for (let i = before; i < meshes.length; i++) owner.set(meshes[i]!, e);
    }
    if (!meshes.length) return null;
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const e = owner.get(hit.object);
    if (e) e.view?.flash();
    return e?.rec ?? null;
  }

  /** Pending ghost ids, the one most in front of the viewer first (then the most recent). */
  ghostsNearest(_memoryRoot: THREE.Object3D, viewer: THREE.Object3D): string[] {
    const head = new THREE.Vector3(), fwd = new THREE.Vector3(), p = new THREE.Vector3();
    viewer.getWorldPosition(head);
    // Camera.getWorldDirection already returns the look direction (-Z); a plain Object3D returns +Z, so flip it.
    viewer.getWorldDirection(fwd);
    if (!(viewer as THREE.Object3D & { isCamera?: boolean }).isCamera) fwd.negate();
    const ghosts = [...this.entries.values()].filter((e) => !e.removed && !e.rec.previewOnly && e.rec.status === 'ghost');
    const scored = ghosts.map((e) => {
      if (!e.view) return { e, ang: Math.PI };
      e.view.root.getWorldPosition(p);
      p.y += 0.4;
      const ang = p.sub(head).normalize().angleTo(fwd);
      return { e, ang };
    });
    scored.sort((a, b) => (a.ang <= 0.26 || b.ang <= 0.26 ? a.ang - b.ang : b.e.rec.createdAt - a.e.rec.createdAt));
    return scored.map((x) => x.e.rec.id);
  }

  /** For tests and the debug HUD: label:phase for every visible object. */
  describe(): string {
    return [...this.entries.values()].map((e) => `${e.rec.label}:${e.view ? e.view.phase : 'loading'}${e.view?.isPlaceholder ? '(placeholder)' : ''}`).join(',');
  }

  get count(): number { return this.entries.size; }

  activate(id: string): boolean | null { return this.entries.get(id)?.view?.toggleGate() ?? null; }

  /** Project the center of an actual solid mesh for pointer-based replay checks. No scene state is changed. */
  screenPoint(id: string, camera: THREE.Camera) {
    const view = this.entries.get(id)?.view;
    if (!view) return null;
    const meshes: THREE.Object3D[] = []; view.pickMeshes(meshes);
    let best: THREE.Vector3 | null = null, volume = -1;
    for (const mesh of meshes) {
      const box = new THREE.Box3().setFromObject(mesh), size = box.getSize(new THREE.Vector3());
      const next = size.x * size.y * size.z;
      if (next > volume) { volume = next; best = box.getCenter(new THREE.Vector3()); }
    }
    return best?.project(camera).toArray() ?? null;
  }

  /** Read-only render evidence: positions belong to the actual animated Three objects. */
  snapshot() {
    return [...this.entries.values()].map(e => ({ id: e.rec.id, label: e.rec.label, preview: !!e.rec.previewOnly,
      phase: e.view?.phase ?? 'loading', position: e.view?.root.position.toArray() ?? null,
      yaw: e.view?.root.rotation.y ?? null, interaction: e.view?.interactionState ?? null,
    }));
  }
}
