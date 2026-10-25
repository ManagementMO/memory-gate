// The kite in your hands. When a kite comes into the memory, its wooden spool is in your hand (the right controller or
// hand in the headset; low on the right of a flat screen, where your hand would be) and the kite flies ahead of you on
// its string, lagging a little behind as you move, its tail rippling. The team's Red Kite models (kite.glb, spool.glb),
// coloured from the words ("a red kite"); a remembered colour goes on its paper.
import { useFrame, useThree } from '@react-three/fiber';
import { useXRInputSourceState } from '@react-three/xr';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useMemory } from '../../flow/memory';
import { useGate } from '../../state/store';
import { damp, dampVec3 } from '../util';
import { loadRealModel } from './realModels';

const STR_SEG = 48;
/** A string that always faces the viewer, wide enough to stay visible at a distance (even in a headset). */
class KiteString {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array((STR_SEG + 1) * 2 * 3);
  private _a = new THREE.Vector3(); private _d = new THREE.Vector3(); private _s = new THREE.Vector3(); private _v = new THREE.Vector3();
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < STR_SEG; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#f3ecdc', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }
  update(from: THREE.Vector3, to: THREE.Vector3, eye: THREE.Vector3, t: number, opacity: number) {
    const sag = from.distanceTo(to) * 0.045;
    const at = (s: number, out: THREE.Vector3) => { out.lerpVectors(from, to, s); out.y -= sag * 4 * s * (1 - s); out.x += Math.sin(t * 2.6 + s * 9) * 0.048 * s * (1 - s); return out; };
    let k = 0;
    for (let i = 0; i <= STR_SEG; i++) {
      const s = i / STR_SEG;
      const p = at(s, this._a);
      const along = this._d.subVectors(at(Math.min(1, s + 1 / STR_SEG), this._v), p).normalize();
      const toEye = this._s.subVectors(eye, p);
      const side = toEye.cross(along).normalize().multiplyScalar(Math.max(0.0016, toEye.length() * 0.0011));
      this.pos.set([p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z], k);
      k += 6;
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * opacity;
    this.mesh.visible = opacity > 0.01;
  }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

/** A copy of a library model with its own materials (so this kite's colour is its own). */
function own(template: THREE.Object3D): THREE.Object3D {
  const copy = template.clone(true);
  copy.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
  });
  return copy;
}

const _hand = new THREE.Vector3(), _eye = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _goal = new THREE.Vector3(), _from = new THREE.Vector3(), _to = new THREE.Vector3(), _off = new THREE.Vector3();

export function HeldKite() {
  const kiteObj = useMemory((s) => s.plan?.objects.find((o) => o.kind === 'kite') ?? null);
  const stage = useGate((s) => s.stage);
  const day = stage === 'forming' || stage === 'memory' || stage === 'leaving';
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const right = useXRInputSourceState('controller', 'right');
  const rightHand = useXRInputSourceState('hand', 'right');
  const [models, setModels] = useState<{ kite: THREE.Object3D; spool: THREE.Object3D } | null>(null);
  useEffect(() => {
    if (!kiteObj) return;
    let live = true;
    void Promise.all([loadRealModel('kite'), loadRealModel('spool')]).then(([k, s]) => { if (live && k && s) setModels({ kite: own(k), spool: own(s) }); });
    return () => { live = false; };
  }, [!!kiteObj]); // eslint-disable-line react-hooks/exhaustive-deps
  // "A red kite": the paper takes the remembered colour (neutral warm paper otherwise).
  useEffect(() => {
    models?.kite.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m.name === 'KitePaper') (m as THREE.MeshStandardMaterial).color.set(kiteObj?.color ?? '#e4d6b6');
    });
  }, [models, kiteObj?.color]);
  const tail = useMemo(() => {
    const nodes: THREE.Object3D[] = [];
    models?.kite.traverse((o) => { if (/^Tail_\d+$/.test(o.name)) nodes.push(o); });
    return nodes.sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);
  const anchors = useMemo(() => ({ kite: models?.kite.getObjectByName('StringAnchor') ?? models?.kite ?? null, spool: models?.spool.getObjectByName('StringExit') ?? models?.spool ?? null }), [models]);
  const string = useMemo(() => new KiteString(), []);
  useEffect(() => () => string.dispose(), [string]);
  const kiteGroup = useRef<THREE.Group>(null);
  const spoolGroup = useRef<THREE.Group>(null);
  const state = useRef({ t: 0, grow: 0, flying: new THREE.Vector3(), placed: false });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = state.current;
    const kg = kiteGroup.current, sg = spoolGroup.current;
    if (!kg || !sg || !models) return;
    const on = day && !!kiteObj;
    st.grow = damp(st.grow, on ? 1 : 0, on ? 1.6 : 4, dt);
    kg.visible = sg.visible = st.grow > 0.01;
    if (!kg.visible) { string.update(_from, _from, _from, 0, 0); st.placed = false; return; }
    st.t += dt;
    camera.getWorldPosition(_eye);
    camera.getWorldQuaternion(_q);
    const yaw = _e.setFromQuaternion(_q, 'YXZ').y;
    // The hand: the right controller or hand when there is one, else where a right hand would hold it.
    const held = gl.xr.isPresenting ? right?.object ?? rightHand?.object : undefined;
    if (held) held.getWorldPosition(_hand);
    else _hand.copy(_eye).add(_off.set(0.3, gl.xr.isPresenting ? -0.5 : -0.42, -0.6).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw));
    sg.position.copy(_hand);
    sg.rotation.set(0.35, yaw, 0.15);
    sg.scale.setScalar(st.grow);
    // The kite flies ahead and above, on the breeze, a little behind the hand's movements.
    _goal.copy(_hand).add(_off.set(-0.35, 1.5, -2.7).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw));
    _goal.x += Math.sin(st.t * 0.63) * 0.25; _goal.y += Math.sin(st.t * 1.1) * 0.12; _goal.z += Math.sin(st.t * 0.47) * 0.15;
    if (!st.placed) { st.flying.copy(_goal); st.placed = true; }
    dampVec3(st.flying, _goal, 1.4, dt);
    kg.position.copy(st.flying);
    kg.rotation.set(-0.35, yaw, Math.sin(st.t * 0.8) * 0.09);
    kg.scale.setScalar(0.4 + 0.6 * st.grow);
    tail.forEach((n, i) => { n.rotation.x = Math.sin(st.t * 2.6 - i * 0.7) * 0.16 * (i + 1) / tail.length; n.rotation.z = Math.sin(st.t * 1.9 - i * 0.55) * 0.12 * (i + 1) / tail.length; });
    kg.updateMatrixWorld(true); sg.updateMatrixWorld(true);
    (anchors.spool ?? sg).getWorldPosition(_from);
    (anchors.kite ?? kg).getWorldPosition(_to);
    string.update(_from, _to, _eye, st.t, st.grow);
  });

  if (!models) return null;
  return (
    <>
      <group ref={spoolGroup} visible={false}><primitive object={models.spool} /></group>
      <group ref={kiteGroup} visible={false}><primitive object={models.kite} /></group>
      <primitive object={string.mesh} />
    </>
  );
}
