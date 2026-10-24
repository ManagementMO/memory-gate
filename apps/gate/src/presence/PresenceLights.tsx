// The others in the visit, as lights waiting just beside you: wherever you go (across the lagoon, into the memory),
// they come along. Anyone can tap something in the memory to say "look here": a soft ring and a thread of light in
// their colour, there for a few seconds for everyone. (Taps work on phones and laptops; a headset only watches.)
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { glowBlending } from '../scene/util';
import { PersonLight } from './PersonLight';
import { pointBus, serverNow, usePresence, type Person } from './presence';
import { useInSceneIds } from '../social/scene/SocialLayer';

// Places beside the viewer in the camera's own frame (x right, y up, -z ahead), nearest first. The right side fills
// first: inside a memory the companion stands to your left.
const SLOTS: [number, number, number][] = [[0.56, -0.42, -1.45], [-0.56, -0.42, -1.45], [0.86, -0.46, -1.3], [-0.86, -0.46, -1.3], [0.3, -0.5, -1.7], [-0.3, -0.5, -1.7]];
const MARK_MS = 7000;
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function Seat({ person, index, onLight }: { person: Person; index: number; onLight: boolean }) {
  const g = useRef<THREE.Group>(null);
  const placed = useRef(false);
  useFrame((st, dt) => {
    if (!g.current) return;
    const slot = SLOTS[index % SLOTS.length]!;
    const aspect = st.size.width / Math.max(1, st.size.height);
    const squeeze = THREE.MathUtils.clamp(aspect / 1.6, 0.42, 1); // narrow screens: the lights come in toward the middle
    st.camera.getWorldPosition(_p);
    st.camera.getWorldQuaternion(_q);
    const yaw = _e.setFromQuaternion(_q, 'YXZ').y;
    _v.set(slot[0] * squeeze, slot[1], slot[2]).applyAxisAngle(UP, yaw).add(_p);
    _v.y += Math.sin(st.clock.elapsedTime * 0.9 + index * 1.7) * 0.025;
    if (!placed.current) { g.current.position.copy(_v); placed.current = true; }
    else g.current.position.lerp(_v, 1 - Math.exp(-3 * Math.min(dt, 0.05)));
  });
  return (
    <group ref={g}>
      <PersonLight color={person.color} pointedAt={person.point?.t ?? null} onLight={onLight} seed={person.seat} />
    </group>
  );
}

function Mark({ at, t, color }: { at: number[]; t: number; color: string }) {
  const g = useRef<THREE.Group>(null);
  const m = useMemo(() => {
    const c = new THREE.Color(color);
    return {
      ring: new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
      beam: glowBlending(new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.7), transparent: true, depthWrite: false, toneMapped: false, fog: false })),
    };
  }, [color]);
  useEffect(() => () => { m.ring.dispose(); m.beam.dispose(); }, [m]);
  useFrame(() => {
    if (!g.current) return;
    const age = (serverNow() - t) / MARK_MS;
    const fade = THREE.MathUtils.clamp(1 - age, 0, 1) * THREE.MathUtils.clamp(age * 8, 0, 1);
    g.current.visible = fade > 0.01;
    const grow = 1 + Math.min(age, 0.25) * 2.4;
    g.current.children[0]?.scale.setScalar(grow);
    m.ring.opacity = fade * 0.9;
    m.beam.color.set(color).multiplyScalar(0.7 * fade);
  });
  return (
    <group ref={g} position={[at[0] ?? 0, at[1] ?? 0, at[2] ?? 0]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.004} material={m.ring}>
        <ringGeometry args={[0.07, 0.085, 48]} />
      </mesh>
      <mesh position-y={0.32} material={m.beam}>
        <cylinderGeometry args={[0.0035, 0.0035, 0.64, 8, 1, true]} />
      </mesh>
    </group>
  );
}

/** A tap (not a drag) on the world while inside a memory marks that spot for everyone. */
function TapToPoint() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null;
    const skip = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible || p.userData.noPoint || p.name === 'figure-companion' || p.name === 'presence') return true;
      return false;
    };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 700) return;
      const g = useGate.getState();
      if (!(g.stage === 'memory' || g.stage === 'forming') || !g.session || !pointBus.send) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.distance < 25 && (h.object as THREE.Mesh).isMesh && !skip(h.object));
      if (hit) pointBus.send([hit.point.x, hit.point.y, hit.point.z]);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); };
  }, [gl, camera, scene]);
  return null;
}

export function PresenceLights() {
  const others = usePresence((s) => s.others);
  const me = usePresence((s) => s.me);
  const myPoint = usePresence((s) => s.myPoint);
  const inScene = useInSceneIds(); // people standing in the memory are drawn where they are (social/SocialLayer)
  const stage = useGate((s) => s.stage);
  const onLight = stage === 'forming' || stage === 'memory' || stage === 'leaving';
  if (stage === 'album') return null;
  const now = serverNow();
  const marks = others.filter((p) => p.point && now - p.point.t < MARK_MS).map((p) => ({ key: `${p.id}-${p.point!.t}`, at: p.point!.at, t: p.point!.t, color: p.color }));
  if (myPoint && me && now - myPoint.t < MARK_MS) marks.push({ key: `me-${myPoint.t}`, at: myPoint.at, t: myPoint.t, color: me.color });
  return (
    <group name="presence">
      {others.filter((p) => !inScene.has(p.id)).map((p, i) => <Seat key={p.id} person={p} index={i} onLight={onLight} />)}
      {marks.map((k) => <Mark key={k.key} at={k.at} t={k.t} color={k.color} />)}
      <TapToPoint />
    </group>
  );
}
