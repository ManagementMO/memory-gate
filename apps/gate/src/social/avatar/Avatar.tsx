// One other person in the memory, where they really are: their head where their eyes are (a grandchild's lower,
// a grandparent's higher), their hands where their hands are (headset) or resting at their sides (phone, laptop).
// Their own likeness when they've shared one (a rigged GLB, docs/AVATARS.md), otherwise a quiet porcelain figure in
// their colour. A name and the perspective they see through float above; someone seeing through a grandchild's eyes
// appears grandchild-sized, whoever they are.
import { Billboard, Text, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { fileUrl } from '../../backend/client';
import { perspectiveById, poses, useSocial } from '../store';
import { findRig, followYaw, reach, turnBone, yawOf } from './rig';

/** The smoothed body of one person, updated each frame from the latest pose. */
type Body = { head: THREE.Vector3; headQ: THREE.Quaternion; left: THREE.Vector3 | null; right: THREE.Vector3 | null; yaw: number; ready: boolean };
const STALE_MS = 5000;

function useBody(memberId: string) {
  const body = useRef<Body>({ head: new THREE.Vector3(), headQ: new THREE.Quaternion(), left: null, right: null, yaw: 0, ready: false });
  const tq = useMemo(() => new THREE.Quaternion(), []);
  const tv = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = poses.get(memberId);
    const b = body.current;
    if (!p || p.head.length !== 7 || Date.now() - p.receivedAt > STALE_MS) { b.ready = false; return; }
    const k = b.ready ? 1 - Math.exp(-14 * dt) : 1;
    b.head.lerp(tv.set(p.head[0]!, p.head[1]!, p.head[2]!), k);
    b.headQ.slerp(tq.set(p.head[3]!, p.head[4]!, p.head[5]!, p.head[6]!).normalize(), k);
    const hand = (v: number[], cur: THREE.Vector3 | null) => (v.length === 7 ? (cur ?? new THREE.Vector3(v[0], v[1], v[2])).lerp(tv.set(v[0]!, v[1]!, v[2]!), k) : null);
    b.left = hand(p.left, b.left);
    b.right = hand(p.right, b.right);
    b.yaw = b.ready ? followYaw(b.yaw, yawOf(b.headQ), dt) : yawOf(b.headQ);
    b.ready = true;
  });
  return body;
}

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const forwardOf = (yaw: number, out: THREE.Vector3) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
const rightOf = (yaw: number, out: THREE.Vector3) => out.set(Math.cos(yaw), 0, -Math.sin(yaw));

function Placeholder({ body, color }: { body: React.RefObject<Body>; color: string }) {
  const g = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const torso = useRef<THREE.Mesh>(null);
  const hands = useRef<(THREE.Mesh | null)[]>([]);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55), roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.4 }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const b = body.current;
    if (!g.current) return;
    g.current.visible = b.ready;
    if (!b.ready) return;
    const s = THREE.MathUtils.clamp(b.head.y / 1.6, 0.4, 1.3);
    forwardOf(b.yaw, _f); rightOf(b.yaw, _r);
    head.current?.position.copy(b.head).addScaledVector(_f, -0.07 * s);
    head.current?.scale.setScalar(s);
    if (torso.current) {
      const top = b.head.y - 0.2 * s, bottom = b.head.y * 0.48;
      torso.current.position.set(b.head.x - _f.x * 0.1 * s, (top + bottom) / 2, b.head.z - _f.z * 0.1 * s);
      torso.current.scale.set(s, Math.max(0.2, top - bottom) / 0.5, s);
      torso.current.rotation.set(0, b.yaw, 0);
    }
    [b.left, b.right].forEach((h, i) => {
      const m = hands.current[i];
      if (!m) return;
      const side = i === 0 ? -1 : 1;
      if (h) m.position.copy(h);
      else m.position.set(b.head.x, b.head.y * 0.52, b.head.z).addScaledVector(_r, side * 0.22 * s).addScaledVector(_f, -0.06 * s);
      m.scale.setScalar(s);
    });
  });
  return (
    <group ref={g}>
      <mesh ref={head} material={mat}><sphereGeometry args={[0.1, 28, 20]} /></mesh>
      <mesh ref={torso} material={mat}><capsuleGeometry args={[0.15, 0.3, 8, 20]} /></mesh>
      <mesh ref={(m) => { hands.current[0] = m; }} material={mat}><sphereGeometry args={[0.045, 16, 12]} /></mesh>
      <mesh ref={(m) => { hands.current[1] = m; }} material={mat}><sphereGeometry args={[0.045, 16, 12]} /></mesh>
    </group>
  );
}

const _rel = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const _part = new THREE.Quaternion();
const _id = new THREE.Quaternion();
const _sh = new THREE.Vector3();
const _t = new THREE.Vector3();
const _pole = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function Likeness({ url, body }: { url: string; body: React.RefObject<Body> }) {
  const gltf = useGLTF(url);
  const built = useMemo(() => {
    const root = cloneSkinned(gltf.scene);
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    const box = new THREE.Box3().setFromObject(root);
    return { root, rig: findRig(root), eye: Math.max(0.5, box.max.y * 0.935) };
  }, [gltf]);
  useEffect(() => () => { built.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }, [built]);
  useFrame(() => {
    const b = body.current;
    const { root, rig, eye } = built;
    root.visible = b.ready;
    if (!b.ready || !rig) return;
    const s = THREE.MathUtils.clamp(b.head.y / eye, 0.3, 1.6);
    forwardOf(b.yaw, _f); rightOf(b.yaw, _r);
    root.position.set(b.head.x, 0, b.head.z).addScaledVector(_f, -0.08 * s);
    root.rotation.set(0, b.yaw + Math.PI, 0); // glTF people face +Z; this yaw is camera-style (-Z forward)
    root.scale.setScalar(s);
    for (const [bone, q] of rig.rest) bone.quaternion.copy(q);
    root.updateMatrixWorld(true);
    // The head's turn relative to where the body faces, shared 40/60 between neck and head.
    _rel.copy(b.headQ).multiply(_yawQ.setFromAxisAngle(UP, b.yaw).invert());
    turnBone(rig.neck, _part.copy(_id).slerp(_rel, 0.4));
    turnBone(rig.head, _part.copy(_id).slerp(_rel, 0.6));
    // Arms: to the hands when the headset tracks them, otherwise resting at the sides.
    const arm = (upper: THREE.Bone, lower: THREE.Bone, hand: THREE.Bone, target: THREE.Vector3 | null, side: number) => {
      upper.getWorldPosition(_sh);
      if (target) _t.copy(target);
      else _t.copy(_sh).addScaledVector(UP, -0.55 * s).addScaledVector(_r, side * 0.07 * s).addScaledVector(_f, 0.04 * s);
      _pole.copy(_sh).addScaledVector(UP, -0.4 * s).addScaledVector(_f, -0.35 * s).addScaledVector(_r, side * 0.25 * s);
      reach(upper, lower, hand, _t, _pole);
    };
    arm(rig.upperL, rig.lowerL, rig.handL, b.left, -1);
    arm(rig.upperR, rig.lowerR, rig.handR, b.right, 1);
  });
  if (!built.rig) throw new Error('This likeness has no recognisable skeleton.');
  return <primitive object={built.root} />;
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[avatar] showing the porcelain figure instead', e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Nameplate({ body, name, perspective, color }: { body: React.RefObject<Body>; name: string; perspective: string; color: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => { const b = body.current; if (!g.current) return; g.current.visible = b.ready; if (b.ready) g.current.position.set(b.head.x, b.head.y + 0.24, b.head.z); });
  return (
    <group ref={g}>
      <Billboard>
        <Text font={fontUrl} fontSize={0.06} anchorX="center" anchorY="bottom" color="#24223a" outlineWidth={0.006} outlineColor="#ffffff" material-toneMapped={false}>{name}</Text>
        {perspective && <Text font={fontUrl} fontSize={0.042} anchorX="center" anchorY="top" position={[0, -0.01, 0]} color={color} outlineWidth={0.005} outlineColor="#ffffff" material-toneMapped={false}>{perspective}</Text>}
      </Billboard>
    </group>
  );
}

/** The figure itself, driven by any body: a likeness when one is shared, otherwise porcelain in the given colour. */
function Figure({ body, url, color, name, sub }: { body: React.RefObject<Body>; url: string | null; color: string; name: string; sub: string }) {
  const placeholder = <Placeholder body={body} color={color} />;
  return (
    <group userData={{ noPoint: true }}>
      {url ? (
        <Fallback fallback={placeholder}>
          <Suspense fallback={placeholder}><Likeness url={url} body={body} /></Suspense>
        </Fallback>
      ) : placeholder}
      <Nameplate body={body} name={name} perspective={sub} color={color} />
    </group>
  );
}

/** Someone who is here, where they really are. */
export function Avatar({ memberId }: { memberId: string }) {
  const body = useBody(memberId);
  const name = useSocial((s) => s.members.find((m) => m.id === memberId)?.name ?? 'Family');
  const avatar = useSocial((s) => s.avatars.find((a) => a.memberId === memberId));
  // Which eyes they see through travels with their pose (not the store): look again twice a second.
  const [perspectiveId, setPerspectiveId] = useState('');
  useEffect(() => { const t = setInterval(() => setPerspectiveId(poses.get(memberId)?.perspectiveId ?? ''), 500); return () => clearInterval(t); }, [memberId]);
  useSocial((s) => s.perspectives); // re-render when perspectives (labels, colours) change
  const p = perspectiveById(perspectiveId);
  return <Figure body={body} url={avatar ? fileUrl(avatar.url) : null} color={p?.color ?? '#cdb4ff'} name={name} sub={p ? `seeing as ${p.label.toLowerCase()}` : ''} />;
}

/**
 * The other perspective when nobody is seeing through it right now: a stand-in at its spot and eye height, facing
 * across the room (the claimant's likeness when they shared one). It steps aside the moment a person is there.
 */
export function StandIn({ at, eye, yaw, color, url, name, sub }: { at: { x: number; z: number }; eye: number; yaw: number; color: string; url: string | null; name: string; sub: string }) {
  const body = useRef<Body>({ head: new THREE.Vector3(), headQ: new THREE.Quaternion(), left: null, right: null, yaw: 0, ready: false });
  useFrame(() => {
    const b = body.current;
    b.head.set(at.x, eye, at.z);
    b.headQ.setFromAxisAngle(UP, yaw);
    b.yaw = yaw; b.ready = true;
  });
  return <Figure body={body} url={url} color={color} name={name} sub={sub} />;
}
