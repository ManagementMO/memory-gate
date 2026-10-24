// A spoken object's life on the headset, driven by the backend record:
//   ghost      warm fresnel light drawing itself up from its anchor ("appearing", then "ghost")
//   confirmed  the solid dissolves in bottom-up behind a gold edge while the ghost dissolves out ("settling" → "solid")
//   undo of a confirm  the solid dissolves back down and the ghost returns ("unsettling" → "ghost")
//   removed    (undone or rejected) everything dissolves down and is disposed ("leaving" → "gone")
//   new model while still a ghost  the old ghost fades while the new one draws up (cross-dissolve)
//   no model yet  a soft glowing placeholder of the object's size with a slow shimmer and an "imagining…" label
// Solids stay in the opaque pass (alpha-test dissolve, no blending), so splats keep sorting correctly around them, and
// keep a faint warm rim: spoken additions always glow. Accepted corrections ease to their new anchor and heading.
// Calm contract: pulses ≤ 0.5 Hz, every brightness change takes ≥ 0.4 s.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GOLD, INK, glowBlending, radialTexture, SEPIA_GLSL, easeInOutCubic, easeOutCubic } from './palette.js';
import type { Motes } from './motes.js';

const GHOST_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const GHOST_FRAG = /* glsl */ `
uniform float uTime, uOpacity, uTop, uBottom, uShimmer;
uniform vec3 uColor;
varying vec3 vN; varying vec3 vW;
float mgHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  float n = mgHash(floor(vW * 70.0)) - 0.5;
  float above = vW.y - uBottom + n * 0.03;
  float below = uTop - vW.y + n * 0.03;
  if (above < 0.0 || below < 0.0) discard;
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.4);
  float scan = 0.5 + 0.5 * sin(vW.y * 110.0 - uTime * 2.2);          // 0.35 Hz drift, 10% amplitude
  float breathe = 0.82 + 0.18 * sin(uTime * 1.7);                     // 0.27 Hz
  float shimmer = 1.0 + uShimmer * 0.35 * sin(vW.y * 7.0 - uTime * 1.8); // placeholder: a slow rising band, 0.29 Hz
  float edge = (1.0 - smoothstep(0.0, 0.035, above)) + (1.0 - smoothstep(0.0, 0.035, below));
  vec3 col = uColor * (0.45 + 1.1 * fres) * (0.9 + 0.1 * scan) * shimmer + edge * vec3(1.0, 0.86, 0.6);
  float a = (0.24 + 0.66 * fres) * breathe + edge * 0.7; // a soft body fill so a far ghost still reads as a glowing form
  gl_FragColor = vec4(col * a * uOpacity, 1.0);
}`;

/** How far above a form's top the ghost top / solid cut rests, so no dissolve edge lingers on a resting object. */
const CLEAR = 0.08;

export type Phase = 'appearing' | 'ghost' | 'settling' | 'solid' | 'unsettling' | 'leaving' | 'gone';

export type BodySpec = { model: THREE.Object3D | null; size: number; modelYaw: number };

/** One visual body: the graded solid, its ghost twin, and their local height range (root space, base at y = 0). */
class Body {
  readonly solid = new THREE.Group();
  readonly ghost: THREE.Group;
  readonly placeholder: boolean;
  readonly ghostU = { uTime: { value: 0 }, uOpacity: { value: 0 }, uTop: { value: 0 }, uBottom: { value: -10 }, uShimmer: { value: 0 }, uColor: { value: GOLD.clone() } };
  readonly solidU = { uCut: { value: -10 }, uGrade: { value: 0.6 }, uEdge: { value: 1 }, uRim: { value: 0.16 } };
  readonly minY: number;
  readonly maxY: number;
  readonly halfX: number;
  readonly halfZ: number;
  private materials: THREE.Material[] = [];
  /** local animation state */
  top = 0; // ghost top (local)
  bottom = -10; // ghost bottom (local)
  cut = -10; // solid cut (local)
  opacity = 0;

  constructor(spec: BodySpec) {
    this.placeholder = !spec.model;
    let content: THREE.Object3D;
    if (spec.model) {
      content = spec.model;
      content.rotation.y = spec.modelYaw;
    } else {
      // A soft rounded block of the object's size (wide, a little lower than wide, not as deep): it reads as
      // "something will stand here" without pretending to be the object.
      const w = spec.size, h = spec.size * 0.8, d = spec.size * 0.7;
      const g = new RoundedBoxGeometry(w, h, d, 6, Math.min(w, h, d) * 0.28);
      content = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    }
    this.solid.add(content);
    // Normalize: largest dimension = category size (Tripo returns a unit box, V24), base on the floor, centered.
    content.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(content);
    const sz = box.getSize(new THREE.Vector3());
    if (spec.model) content.scale.multiplyScalar(spec.size / Math.max(sz.x, sz.y, sz.z, 1e-6));
    content.updateMatrixWorld(true);
    box.setFromObject(content);
    const c = box.getCenter(new THREE.Vector3());
    content.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
    content.updateMatrixWorld(true);
    box.setFromObject(content);
    this.minY = box.min.y - 0.02;
    this.maxY = box.max.y + 0.03;
    this.halfX = (box.max.x - box.min.x) / 2;
    this.halfZ = (box.max.z - box.min.z) / 2;

    this.ghost = this.solid.clone(true);
    const ghostMat = glowBlending(new THREE.ShaderMaterial({ uniforms: this.ghostU, vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG }));
    this.materials.push(ghostMat);
    this.ghostU.uShimmer.value = this.placeholder ? 1 : 0;
    this.ghost.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = ghostMat; m.renderOrder = 999; m.userData.mgGhost = true; }
    });
    if (this.placeholder) {
      // The placeholder has no solid form: confirming it keeps the light (a calm, steady glow).
      this.solid.visible = false;
      (content as THREE.Mesh).material = ghostMat;
    } else {
      this.solid.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const src = Array.isArray(m.material) ? m.material[0] : m.material;
          m.material = this.gradeMaterial(src as THREE.MeshStandardMaterial);
          m.userData.mgSolid = true;
        }
      });
    }
    this.solid.visible = false;
    this.ghost.visible = false;
    this.top = this.minY;
    this.cut = this.minY;
  }

  private gradeMaterial(src: THREE.Material): THREE.Material {
    const std = src as THREE.MeshStandardMaterial;
    const m = (std.isMeshStandardMaterial ? std.clone() : new THREE.MeshStandardMaterial({ color: 0xc8b090 })) as THREE.MeshStandardMaterial;
    m.metalness = 0; // Tripo ships metallicFactor 1 + an ORM map; wood and fabric read as plastic-metal without this
    m.metalnessMap = null;
    m.envMapIntensity = 0.9;
    m.transparent = false;
    m.depthWrite = true;
    const u = this.solidU;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vMgW;\nvoid main() {')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vMgW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `uniform float uCut, uGrade, uEdge, uRim;\nvarying vec3 vMgW;\n${SEPIA_GLSL}\nvoid main() {`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float mgN = fract(sin(dot(floor(vMgW * 70.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453) - 0.5;
  float mgK = uCut - vMgW.y + mgN * 0.03;
  if (mgK < 0.0) discard;`)
        .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mgSepia(gl_FragColor.rgb) * 1.04, uGrade);
  float mgRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
  gl_FragColor.rgb += mgRim * vec3(1.0, 0.78, 0.45) * uRim;
  gl_FragColor.rgb += (1.0 - smoothstep(0.0, 0.035, mgK)) * vec3(1.0, 0.78, 0.45) * 1.3 * uEdge;`);
    };
    m.customProgramCacheKey = () => 'mg-solid-v2';
    this.materials.push(m);
    return m;
  }

  /** Push local heights to the shader uniforms in world space (the root only ever translates and yaws). */
  sync(baseY: number, time: number, pause: number): void {
    this.ghostU.uTime.value = time;
    this.ghostU.uTop.value = baseY + this.top;
    this.ghostU.uBottom.value = baseY + this.bottom;
    this.ghostU.uOpacity.value = this.opacity * pause;
    // Pause hides solids the way they leave: the cut sinks to the floor (and rises again on resume).
    const cut = this.minY + (this.cut - this.minY) * pause;
    this.solidU.uCut.value = baseY + cut;
  }

  meshes(out: THREE.Object3D[]): void {
    const src = this.placeholder ? this.ghost : this.solid;
    src.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o); });
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.materials = [];
    if (this.placeholder) this.solid.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

/** Small serif label ("imagining…") that floats above a placeholder, upright and turned toward the viewer. */
class Label {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private tex: THREE.CanvasTexture;
  constructor(text: string) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const c = cv.getContext('2d')!;
    c.font = 'italic 400 64px Georgia, "Iowan Old Style", "Noto Serif", serif';
    const w = Math.min(500, c.measureText(text).width + 64);
    c.fillStyle = 'rgba(24,16,10,0.62)';
    c.beginPath(); c.roundRect((512 - w) / 2, 16, w, 96, 48); c.fill();
    c.fillStyle = INK;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 256, 66);
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.11), this.mat);
    this.mesh.renderOrder = 2000;
  }
  set opacity(v: number) { this.mat.opacity = v; this.mesh.visible = v > 0.002; }
  dispose(): void { this.tex.dispose(); this.mat.dispose(); this.mesh.geometry.dispose(); }
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _box = new THREE.Box3();

export type ObjectSpec = {
  id: string;
  label: string;
  size: number;
  /** Target position in memory-root space, changed only by confirmed authoring revisions. */
  position: THREE.Vector3;
  /** Yaw that turns the model's +Z front toward the viewer at the memory-root origin. */
  rootYaw: number;
};

export class MemoryObject {
  readonly root = new THREE.Group();
  phase: Phase = 'appearing';
  private body: Body;
  private outgoing: { body: Body; t: number }[] = [];
  private shadow: THREE.Mesh;
  private shadowMat: THREE.MeshBasicMaterial;
  private label: Label | null = null;
  private t = 0;
  private pause = 1; // 1 shown … 0 hidden (paused)
  private paused = false;
  private highlight = 0;
  private gateOpen = false;
  private gateAngle = 0;
  private inspecting = false;
  private shadowBase = 0;
  private labelO = 0;
  private removedCb: (() => void) | null = null;
  constructor(readonly spec: ObjectSpec, body: BodySpec, private motes: Motes, opts: { confirmed?: boolean; quiet?: boolean } = {}) {
    this.root.name = `memory-object:${spec.label}`;
    this.root.position.copy(spec.position);
    this.root.rotation.y = spec.rootYaw;
    this.body = this.attach(body);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(16,9,4,0.9)', 'rgba(16,9,4,0)'), transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.shadow.renderOrder = 998;
    this.fitShadow();
    this.root.add(this.shadow);
    if (opts.confirmed) {
      // Already confirmed when we first see it (page load): appear solid, drawing up gently.
      this.phase = 'settling';
      this.body.solid.visible = !this.body.placeholder;
      this.body.ghost.visible = this.body.placeholder;
      this.body.cut = this.body.minY;
      this.body.top = this.body.placeholder ? this.body.maxY + CLEAR : this.body.minY;
      this.body.opacity = this.body.placeholder ? 1 : 0;
      this.t = opts.quiet ? 1.6 : 0;
    } else {
      this.body.ghost.visible = true;
    }
    this.syncLabel();
  }

  private attach(spec: BodySpec): Body {
    const b = new Body(spec);
    this.root.add(b.solid, b.ghost);
    return b;
  }

  private fitShadow(): void {
    this.shadow.scale.set(this.body.halfX * 3 + 0.12, this.body.halfZ * 3 + 0.12, 1);
  }

  private syncLabel(): void {
    const want = this.body.placeholder && (this.phase === 'appearing' || this.phase === 'ghost');
    if (want && !this.label) {
      this.label = new Label('imagining…');
      this.root.add(this.label.mesh);
    }
  }

  get isPlaceholder(): boolean { return this.body.placeholder; }

  setPlacement(position: THREE.Vector3, yaw: number): void {
    this.spec.position.copy(position);
    this.spec.rootYaw = yaw;
  }

  setInspecting(held: boolean): void {
    if (this.inspecting && !held) { this.root.rotation.x = 0; this.root.rotation.z = 0; }
    this.inspecting = held;
  }

  /** ghost → confirmed */
  confirm(): void {
    if (this.phase === 'appearing' || this.phase === 'ghost' || this.phase === 'unsettling') {
      this.finishOutgoing();
      this.phase = 'settling';
      this.t = 0;
      this.body.solid.visible = !this.body.placeholder;
      if (this.body.placeholder) this.body.top = this.body.maxY + CLEAR;
    }
  }

  /** confirmed → ghost (an undo of the confirm) */
  unconfirm(): void {
    if (this.phase === 'solid' || this.phase === 'settling') {
      this.phase = 'unsettling';
      this.t = 0;
      this.body.ghost.visible = true;
    }
  }

  /** The record left the list (undone or rejected): dissolve down, then dispose. */
  remove(onGone: () => void): void {
    if (this.phase === 'leaving' || this.phase === 'gone') return;
    this.removedCb = onGone;
    this.phase = 'leaving';
    this.t = 0;
  }

  /** A new model while still a ghost (the live model arrived): cross-dissolve to it. */
  swapModel(spec: BodySpec): void {
    if (this.phase !== 'appearing' && this.phase !== 'ghost') return;
    this.outgoing.push({ body: this.body, t: 0 });
    this.body = this.attach(spec);
    this.body.ghost.visible = true;
    this.fitShadow();
    this.phase = 'appearing';
    this.t = 0;
    if (!this.body.placeholder && this.label) { this.root.remove(this.label.mesh); this.label.dispose(); this.label = null; }
    this.syncLabel();
  }

  setPaused(p: boolean): void { this.paused = p; if (!p) this.root.visible = this.phase !== 'gone'; }

  /** A brief warm rim swell when selected (replay); ≥ 0.4 s up and down. */
  flash(): void { this.highlight = 1; }

  /** A local exploration interaction; it never changes the family's accepted placement. */
  toggleGate(): boolean | null {
    if (this.paused || !this.confirmedLike || !this.body.solid.getObjectByName('GateHinge')) return null;
    this.gateOpen = !this.gateOpen;
    this.flash();
    return this.gateOpen;
  }

  get interactionState(): { gateOpen: boolean; gateAngle: number } | null {
    return this.body.solid.getObjectByName('GateHinge') ? { gateOpen: this.gateOpen, gateAngle: this.gateAngle } : null;
  }

  pickMeshes(out: THREE.Object3D[]): void {
    if (this.phase === 'solid' || this.phase === 'settling') this.body.meshes(out);
  }

  get confirmedLike(): boolean { return this.phase === 'solid' || this.phase === 'settling'; }

  private finishOutgoing(): void {
    for (const o of this.outgoing) { this.root.remove(o.body.solid, o.body.ghost); o.body.dispose(); }
    this.outgoing = [];
  }

  private emitBand(y: number, count: number, strength: number): void {
    this.root.getWorldPosition(_v);
    const r = Math.max(this.body.halfX, this.body.halfZ) * 0.9;
    this.motes.emitRing(_v.x, _v.y + y, _v.z, r, count, strength);
  }

  update(dt: number, time: number, viewer: THREE.Object3D): void {
    if (this.phase === 'gone') return;
    const follow = 1 - Math.exp(-Math.min(dt, 0.1) * 8);
    if (!this.inspecting) {
      this.root.position.lerp(this.spec.position, follow);
      const yawDelta = Math.atan2(Math.sin(this.spec.rootYaw - this.root.rotation.y), Math.cos(this.spec.rootYaw - this.root.rotation.y));
      this.root.rotation.y += yawDelta * follow;
    }
    this.t += dt;
    const b = this.body;
    const hinge = b.solid.getObjectByName('GateHinge');
    if (hinge && !this.paused) {
      this.gateAngle += ((this.gateOpen ? -Math.PI * .48 : 0) - this.gateAngle) * (1 - Math.exp(-dt * 4));
      hinge.rotation.y = this.gateAngle;
    }
    const span = b.maxY - b.minY;
    if (this.phase === 'appearing') {
      const k = Math.min(1, this.t / 1.1);
      b.top = b.minY + (span + CLEAR) * easeOutCubic(k);
      b.bottom = -10;
      b.opacity = Math.min(1, this.t / 0.5);
      this.shadowBase = 0.16 * k;
      if (Math.random() < 0.5) this.emitBand(b.top, 1, 0.5);
      if (k >= 1) this.phase = 'ghost';
    } else if (this.phase === 'ghost') {
      b.top = b.maxY + CLEAR; b.bottom = -10; b.opacity = 1;
      this.shadowBase = 0.16;
    } else if (this.phase === 'settling') {
      const k = Math.min(1, this.t / 1.6);
      const cut = b.minY + span * easeInOutCubic(k);
      if (b.placeholder) {
        b.opacity = 1;
        b.top = b.maxY + CLEAR;
      } else {
        b.cut = cut;
        b.bottom = cut; // the ghost dissolves out above the rising solid
        this.emitBand(cut, 2, 1);
      }
      this.shadowBase = 0.16 + 0.42 * k;
      if (k >= 1) {
        this.phase = 'solid';
        b.ghost.visible = b.placeholder;
        if (!b.placeholder) { this.root.getWorldPosition(_v); this.motes.emitBurst(_v.x, _v.y + (b.minY + b.maxY) / 2, _v.z, b.halfX, span / 2, b.halfZ, 36); }
      }
    } else if (this.phase === 'solid') {
      if (!b.placeholder) b.cut = b.maxY + CLEAR; // just above the top: no settle edge left on a resting object
      this.shadowBase = 0.58;
    } else if (this.phase === 'unsettling') {
      const k = Math.min(1, this.t / 1.4);
      const cut = b.maxY - span * easeInOutCubic(k);
      b.cut = cut;
      b.top = b.maxY + CLEAR;
      b.bottom = cut;
      b.opacity = 1;
      this.shadowBase = 0.58 - 0.42 * k;
      if (!b.placeholder) this.emitBand(cut, 1, 0.6);
      if (k >= 1) { this.phase = 'ghost'; b.solid.visible = false; b.bottom = -10; }
    } else if (this.phase === 'leaving') {
      const k = Math.min(1, this.t / 1.3);
      const cut = b.maxY - span * easeInOutCubic(k);
      b.cut = Math.min(b.cut, cut);
      b.top = Math.min(b.top, cut);
      b.opacity *= 1 - Math.min(1, dt * 1.2);
      this.shadowBase *= 1 - Math.min(1, dt * 3);
      if (k < 1) this.emitBand(cut, 1, 0.8);
      if (k >= 1) {
        this.phase = 'gone';
        this.root.visible = false;
        const cb = this.removedCb; this.removedCb = null; cb?.();
        return;
      }
    }

    // Cross-dissolve: older bodies fade out while the new one draws up.
    for (let i = this.outgoing.length - 1; i >= 0; i--) {
      const o = this.outgoing[i]!;
      o.t += dt;
      o.body.opacity = Math.max(0, 1 - o.t / 0.9);
      o.body.top = o.body.maxY + CLEAR;
      if (o.t >= 0.9) { this.root.remove(o.body.solid, o.body.ghost); o.body.dispose(); this.outgoing.splice(i, 1); }
    }

    // Pause: everything fades to 0 over ~1.5 s, then visible = false; resume restores it.
    const target = this.paused ? 0 : 1;
    if (this.pause !== target) {
      this.pause = target > this.pause ? Math.min(1, this.pause + dt / 1.5) : Math.max(0, this.pause - dt / 1.5);
    }
    const pauseK = easeInOutCubic(this.pause);
    if (this.paused && this.pause <= 0) { this.root.visible = false; return; }
    this.root.visible = true;

    // Selection swell on the permanent rim (up over 0.4 s, down over ~1 s).
    if (this.highlight > 0) this.highlight = Math.max(0, this.highlight - dt * 0.8);
    const h = this.highlight > 0.6 ? (1 - this.highlight) / 0.4 : this.highlight / 0.6;
    b.solidU.uRim.value = 0.16 + 0.5 * Math.max(0, Math.min(1, h)) * (this.highlight > 0 ? 1 : 0);

    this.root.updateMatrixWorld();
    const baseY = this.root.matrixWorld.elements[13]!;
    b.sync(baseY, time, pauseK);
    for (const o of this.outgoing) o.body.sync(baseY, time, pauseK);
    this.shadow.visible = pauseK > 0.01;
    this.shadowMat.opacity = this.shadowBase * pauseK;

    if (this.label) {
      const show = (this.phase === 'appearing' || this.phase === 'ghost') && b.placeholder ? 1 : 0;
      this.labelO += (show - this.labelO) * Math.min(1, dt * 2.5);
      const next = this.labelO;
      this.label.opacity = next * 0.95 * pauseK;
      // Upright above the form, turned toward the viewer (yaw only, in the root's frame).
      this.label.mesh.position.set(0, b.maxY + 0.09, 0);
      viewer.getWorldPosition(_v);
      this.root.worldToLocal(_v);
      this.label.mesh.rotation.set(0, Math.atan2(_v.x, _v.z), 0);
      if (show === 0 && next < 0.01) { this.root.remove(this.label.mesh); this.label.dispose(); this.label = null; }
    }
  }

  /** World-space bounds of the current body (for replay captions and debugging). */
  worldBox(out = _box): THREE.Box3 {
    this.root.getWorldPosition(_v);
    this.root.getWorldQuaternion(_q);
    const r = Math.max(this.body.halfX, this.body.halfZ);
    out.min.set(_v.x - r, _v.y + this.body.minY, _v.z - r);
    out.max.set(_v.x + r, _v.y + this.body.maxY, _v.z + r);
    return out;
  }

  dispose(): void {
    this.finishOutgoing();
    this.body.dispose();
    this.shadowMat.map?.dispose();
    this.shadowMat.dispose();
    this.shadow.geometry.dispose();
    this.label?.dispose();
    this.root.removeFromParent();
  }
}
