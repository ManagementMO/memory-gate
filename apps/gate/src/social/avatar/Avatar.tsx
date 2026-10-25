// One other person in the memory, where they really are: the grandchild as a boy, the grandparent as his grandmother
// (people.ts), at their true size and on the ground, walking when the person walks (as fast as they really move, the
// way they're going), their head turning with the person's head, and in the headset their arms reaching for where
// their hands really are. Someone who has shared their own likeness (a rigged GLB, docs/AVATARS.md) wears that
// instead; while a figure loads, or if it can't, a quiet porcelain figure in their colour stands in. A name and the
// perspective they see through float above.
import { Billboard, Text, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { fileUrl } from '../../backend/client';
import { perspectiveById, poses, useSocial, type PerspectiveKey } from '../store';
import { groundAt } from '../walk';
import { personFor, type Person } from './people';
import { findRig, followYaw, reach, turnBone, yawOf } from './rig';
import { Loop, RestPose, WalkCycle, idleClipOf, walkClipOf } from './walkCycle';

/** The smoothed body of one person, updated each frame from the latest pose. `speed` is how fast they're really
 *  moving over the ground (m/s) and `heading` which way (a camera-style yaw). */
type Body = {
  head: THREE.Vector3; headQ: THREE.Quaternion; left: THREE.Vector3 | null; right: THREE.Vector3 | null; yaw: number; ready: boolean;
  ground: number; speed: number; heading: number;
};
const newBody = (): Body => ({ head: new THREE.Vector3(), headQ: new THREE.Quaternion(), left: null, right: null, yaw: 0, ready: false, ground: 0, speed: 0, heading: 0 });
const STALE_MS = 5000;
/** A pose that hasn't changed for this long means they've stopped (a still screen only repeats itself once a second). */
const STILL_MS = 350;

/** What each figure is doing right now (read by the automated checks, like window.__socialDrawn). */
type Seen = { model: string; walking: number; speed: number; at: [number, number, number] };
export const people = new Map<string, Seen>();
(window as unknown as { __people?: typeof people }).__people = people;

const angleTo = (from: number, to: number) => { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

function useBody(memberId: string) {
  const body = useRef<Body>(newBody());
  const last = useRef<{ x: number; z: number; at: number } | null>(null);
  const moving = useRef({ speed: 0, heading: 0 });
  const tq = useMemo(() => new THREE.Quaternion(), []);
  const tv = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = poses.get(memberId);
    const b = body.current;
    if (!p || p.head.length !== 7 || Date.now() - p.receivedAt > STALE_MS) { b.ready = false; last.current = null; return; }
    // How fast they're going, from one pose to the next (the exchange's own clock, so network jitter doesn't count).
    const l = last.current, x = p.head[0]!, z = p.head[2]!;
    if (!l) last.current = { x, z, at: p.updatedAt };
    else if (p.updatedAt > l.at) {
      const secs = (p.updatedAt - l.at) / 1000, dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz);
      if (secs < 1.5) { moving.current.speed = d / secs; if (d > 0.01) moving.current.heading = Math.atan2(-dx, -dz); }
      last.current = { x, z, at: p.updatedAt };
    }
    if (Date.now() - p.receivedAt > STILL_MS) moving.current.speed = 0;
    const k = b.ready ? 1 - Math.exp(-14 * dt) : 1;
    b.head.lerp(tv.set(x, p.head[1]!, z), k);
    b.headQ.slerp(tq.set(p.head[3]!, p.head[4]!, p.head[5]!, p.head[6]!).normalize(), k);
    const hand = (v: number[], cur: THREE.Vector3 | null) => (v.length === 7 ? (cur ?? new THREE.Vector3(v[0], v[1], v[2])).lerp(tv.set(v[0]!, v[1]!, v[2]!), k) : null);
    b.left = hand(p.left, b.left);
    b.right = hand(p.right, b.right);
    b.speed = THREE.MathUtils.damp(b.speed, moving.current.speed, 6, dt);
    b.heading = moving.current.heading;
    const ground = groundAt(b.head.x, b.head.z, b.head.y - 1.3);
    b.ground = b.ready ? THREE.MathUtils.damp(b.ground, ground, 10, dt) : ground;
    // The body faces the way they walk (backwards steps stay facing forward); standing, it eases after the head.
    const headYaw = yawOf(b.headQ);
    if (!b.ready) b.yaw = headYaw;
    else if (b.speed > 0.3) {
      const back = Math.abs(angleTo(headYaw, b.heading)) > Math.PI * 0.6;
      const to = back ? b.heading + Math.PI : b.heading;
      b.yaw += angleTo(b.yaw, to) * (1 - Math.exp(-6 * dt));
    } else b.yaw = followYaw(b.yaw, headYaw, dt);
    b.ready = true;
  });
  return body;
}

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const forwardOf = (yaw: number, out: THREE.Vector3) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
const rightOf = (yaw: number, out: THREE.Vector3) => out.set(Math.cos(yaw), 0, -Math.sin(yaw));
/** How much of the walk to show at this speed: none while standing (or swaying), all of it by a slow stroll. */
const walkWeight = (speed: number) => THREE.MathUtils.smoothstep(speed, 0.15, 0.45);

function Placeholder({ body, color, tag }: { body: React.RefObject<Body>; color: string; tag: string }) {
  const g = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const torso = useRef<THREE.Mesh>(null);
  const hands = useRef<(THREE.Mesh | null)[]>([]);
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55), roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.4 }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => { if (people.get(tag)?.model === 'placeholder') people.delete(tag); }, [tag]);
  useFrame(() => {
    const b = body.current;
    if (!g.current) return;
    g.current.visible = b.ready;
    if (!b.ready) return;
    people.set(tag, { model: 'placeholder', walking: 0, speed: b.speed, at: [b.head.x, b.ground, b.head.z] });
    const tall = b.head.y - b.ground;
    const s = THREE.MathUtils.clamp(tall / 1.6, 0.4, 1.3);
    forwardOf(b.yaw, _f); rightOf(b.yaw, _r);
    head.current?.position.copy(b.head).addScaledVector(_f, -0.07 * s);
    head.current?.scale.setScalar(s);
    if (torso.current) {
      const top = b.head.y - 0.2 * s, bottom = b.ground + tall * 0.48;
      torso.current.position.set(b.head.x - _f.x * 0.1 * s, (top + bottom) / 2, b.head.z - _f.z * 0.1 * s);
      torso.current.scale.set(s, Math.max(0.2, top - bottom) / 0.5, s);
      torso.current.rotation.set(0, b.yaw, 0);
    }
    [b.left, b.right].forEach((h, i) => {
      const m = hands.current[i];
      if (!m) return;
      const side = i === 0 ? -1 : 1;
      if (h) m.position.copy(h);
      else m.position.set(b.head.x, b.ground + tall * 0.52, b.head.z).addScaledVector(_r, side * 0.22 * s).addScaledVector(_f, -0.06 * s);
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
const _held = [new THREE.Quaternion(), new THREE.Quaternion()];
const _ik = [new THREE.Quaternion(), new THREE.Quaternion()];
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A rigged person driven by a body. `trueSize`: a known character (people.ts), shown at its own height on the ground;
 * otherwise (a shared likeness of any size) scaled so its eyes are at the person's eyes. Any idle loop in the file
 * plays while they stand, and any walk loop as they move.
 */
function Rigged({ url, label, body, trueSize, tag }: { url: string; label: string; body: React.RefObject<Body>; trueSize: boolean; tag: string }) {
  const gltf = useGLTF(url);
  const built = useMemo(() => {
    const root = cloneSkinned(gltf.scene);
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    const box = new THREE.Box3().setFromObject(root);
    const rest = new RestPose(root);
    const clip = walkClipOf(gltf.animations), still = idleClipOf(gltf.animations);
    return { root, rig: findRig(root), rest, idle: still ? new Loop(root, still) : null, cycle: clip ? new WalkCycle(root, clip, rest) : null, eye: Math.max(0.5, box.max.y * 0.935) };
  }, [gltf]);
  const phase = useRef(0);
  const idleTime = useRef(0);
  useEffect(() => () => { built.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }, [built]);
  useEffect(() => () => { people.delete(tag); }, [tag]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const b = body.current;
    const { root, rig, rest, idle, cycle, eye } = built;
    root.visible = b.ready;
    if (!b.ready || !rig) return;
    const s = trueSize ? 1 : THREE.MathUtils.clamp((b.head.y - b.ground) / eye, 0.3, 1.6);
    forwardOf(b.yaw, _f); rightOf(b.yaw, _r);
    root.position.set(b.head.x, b.ground, b.head.z).addScaledVector(_f, -0.08 * s);
    root.rotation.set(0, b.yaw + Math.PI, 0); // glTF people face +Z; this yaw is camera-style (-Z forward)
    root.scale.setScalar(s);
    rest.reset();
    // Standing, their idle loop (it keeps going under the walk, so stopping picks it up again where it is).
    if (idle) { idleTime.current += dt; idle.apply(idleTime.current, 1); }
    // The walk, as much as they're walking, at the pace that keeps its feet on the ground (backwards when stepping back).
    const w = cycle ? walkWeight(b.speed) : 0;
    if (cycle && w > 0) {
      const back = Math.abs(angleTo(b.yaw, b.heading)) > Math.PI / 2 ? -1 : 1;
      phase.current += dt * THREE.MathUtils.clamp(b.speed / (cycle.pace * s), 0.5, 2.2) * back;
      cycle.apply(phase.current, w);
    }
    root.updateMatrixWorld(true);
    people.set(tag, { model: label, walking: w, speed: b.speed, at: [root.position.x, b.ground, root.position.z] });
    // The head's turn relative to where the body faces, shared 40/60 between neck and head.
    _rel.copy(b.headQ).multiply(_yawQ.setFromAxisAngle(UP, b.yaw).invert());
    turnBone(rig.neck, _part.copy(_id).slerp(_rel, 0.4));
    turnBone(rig.head, _part.copy(_id).slerp(_rel, 0.6));
    // Arms: to the hands when the headset tracks them; otherwise swinging with the walk, and standing, the idle's own
    // (or, without one, resting at the sides).
    const arm = (upper: THREE.Bone, lower: THREE.Bone, hand: THREE.Bone, target: THREE.Vector3 | null, side: number) => {
      if (!target && (idle || w > 0.999)) return;
      _held[0]!.copy(upper.quaternion); _held[1]!.copy(lower.quaternion);
      upper.getWorldPosition(_sh);
      if (target) _t.copy(target);
      else _t.copy(_sh).addScaledVector(UP, -0.55 * s).addScaledVector(_r, side * 0.07 * s).addScaledVector(_f, 0.04 * s);
      _pole.copy(_sh).addScaledVector(UP, -0.4 * s).addScaledVector(_f, -0.35 * s).addScaledVector(_r, side * 0.25 * s);
      reach(upper, lower, hand, _t, _pole);
      if (!target && w > 0.001) {
        _ik[0]!.copy(upper.quaternion); _ik[1]!.copy(lower.quaternion);
        upper.quaternion.copy(_held[0]!).slerp(_ik[0]!, 1 - w);
        lower.quaternion.copy(_held[1]!).slerp(_ik[1]!, 1 - w);
        upper.updateMatrixWorld(true);
      }
    };
    arm(rig.upperL, rig.lowerL, rig.handL, b.left, -1);
    arm(rig.upperR, rig.lowerR, rig.handR, b.right, 1);
  });
  if (!built.rig) throw new Error('This figure has no recognisable skeleton.');
  return <primitive object={built.root} />;
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[avatar] showing the porcelain figure instead', e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Names over the figures are off for the demo (the people are their likenesses, not labels); ?names=1 shows them. */
const NAMES = new URLSearchParams(location.search).get('names') === '1';

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

/** The figure itself, driven by any body: their likeness when shared, otherwise their perspective's person. */
function Figure({ body, url, person, color, name, sub, tag }: { body: React.RefObject<Body>; url: string | null; person: Person | null; color: string; name: string; sub: string; tag: string }) {
  const placeholder = <Placeholder body={body} color={color} tag={tag} />;
  const model = url ?? person?.url ?? null;
  return (
    <group userData={{ noPoint: true }}>
      {model ? (
        <Fallback key={model} fallback={placeholder}>
          <Suspense fallback={placeholder}><Rigged url={model} label={url ? 'likeness' : person!.label} body={body} trueSize={!url} tag={tag} /></Suspense>
        </Fallback>
      ) : placeholder}
      {NAMES && <Nameplate body={body} name={name} perspective={sub} color={color} />}
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
  const cast = useSocial((s) => s.cast);
  const p = perspectiveById(perspectiveId);
  return <Figure body={body} url={avatar ? fileUrl(avatar.url) : null} person={p ? personFor(p.key, cast) : null} color={p?.color ?? '#cdb4ff'} name={name}
    sub={p ? `seeing as ${p.label.toLowerCase()}` : ''} tag={memberId} />;
}

/**
 * The other perspective when nobody is seeing through it right now: its person, standing at its spot, facing across
 * the room, as they wait (people.ts standIn: the boy playing with his daisy), or the claimant's likeness when they
 * shared one. It steps aside the moment a person is there, who is seen as the walking figure.
 */
export function StandIn({ perspective, at, eye, yaw, color, url, name, sub }: { perspective: PerspectiveKey; at: { x: number; z: number }; eye: number; yaw: number; color: string; url: string | null; name: string; sub: string }) {
  const body = useRef<Body>(newBody());
  const cast = useSocial((s) => s.cast);
  useFrame(() => {
    const b = body.current;
    b.ground = groundAt(at.x, at.z);
    b.head.set(at.x, b.ground + eye, at.z);
    b.headQ.setFromAxisAngle(UP, yaw);
    b.yaw = yaw; b.speed = 0; b.ready = true;
  });
  const person = personFor(perspective, cast);
  return <Figure body={body} url={url} person={person.standIn ? { ...person, url: person.standIn } : person} color={color} name={name} sub={sub} tag={`stand-in:${perspective}`} />;
}
