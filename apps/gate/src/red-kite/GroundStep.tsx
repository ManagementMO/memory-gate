import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { MeadowTraversal } from './traversal';

const HOLD_MS = 450;
const _head = new THREE.Vector3();

/**
 * Walking by pinch, for hands (which have no sticks) and controllers alike: hold a pinch or trigger on the meadow's
 * ground for half a second (a ring fills where you point), let go, and you step there behind a short blink. The step
 * goes through the same traversal as the sticks, so it lands on walkable ground or not at all.
 */
export function GroundStep({ traversal, blocked }: { traversal: RefObject<MeadowTraversal | null>; blocked: RefObject<boolean> }) {
  const camera = useThree(s => s.camera);
  const presenting = useXR(s => s.session != null);
  const held = useRef<null | { id: number; t0: number; point: THREE.Vector3 }>(null);
  const ring = useRef<THREE.Mesh>(null), blink = useRef<THREE.Mesh>(null);
  const fade = useRef({ amount: 0, dir: 0, pending: null as null | (() => void) });

  const down = (e: ThreeEvent<PointerEvent>) => {
    if (blocked.current || !traversal.current) return;
    e.stopPropagation();
    held.current = { id: e.pointerId, t0: performance.now(), point: e.point.clone() };
  };
  const move = (e: ThreeEvent<PointerEvent>) => { if (held.current?.id === e.pointerId) held.current.point.copy(e.point); };
  const cancel = (e: ThreeEvent<PointerEvent>) => { if (held.current?.id === e.pointerId) held.current = null; };
  const up = (e: ThreeEvent<PointerEvent>) => {
    const h = held.current, t = traversal.current;
    held.current = null;
    if (!h || h.id !== e.pointerId || !t || blocked.current || performance.now() - h.t0 < HOLD_MS || fade.current.dir !== 0) return;
    camera.getWorldPosition(_head);
    const f = t.feet, dx = h.point.x - _head.x, dz = h.point.z - _head.z; // the head, not the play space, lands there
    fade.current.pending = () => { try { t.place([f[0] + dx, f[1], f[2] + dz]); } catch { /* not walkable there: stay */ } };
    fade.current.dir = 1;
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, .05), f = fade.current;
    if (f.dir !== 0) {
      f.amount = THREE.MathUtils.clamp(f.amount + f.dir * dt / (f.dir > 0 ? .12 : .2), 0, 1);
      if (f.amount >= 1 && f.dir > 0) { f.pending?.(); f.pending = null; f.dir = -1; } else if (f.amount <= 0 && f.dir < 0) f.dir = 0;
    }
    camera.getWorldPosition(_head);
    if (blink.current) {
      blink.current.visible = f.amount > .01; blink.current.position.copy(_head);
      (blink.current.material as THREE.MeshBasicMaterial).opacity = f.amount;
    }
    const h = held.current, t = traversal.current;
    if (ring.current) {
      ring.current.visible = !!h;
      if (h) {
        const p = Math.min(1, (performance.now() - h.t0) / HOLD_MS), g = t?.groundAt(h.point.x, h.point.z, _head.y + 1, 12);
        ring.current.position.set(h.point.x, (g ?? h.point.y) + .02, h.point.z);
        ring.current.scale.setScalar(.5 + .5 * p);
        (ring.current.material as THREE.MeshBasicMaterial).opacity = .25 + .6 * p;
      }
    }
  });

  if (!presenting) return null;
  return <>
    {/* The meadow is splats (not pointable); an unseen ground catches the pinch. Nearer things (the spool, the panel's
        buttons) still take a ray first. */}
    <mesh name="RedKiteGroundStep" rotation-x={-Math.PI / 2} position={[0, .003, 0]} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={cancel}>
      <circleGeometry args={[25, 64]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
    <mesh ref={ring} visible={false} rotation-x={-Math.PI / 2} renderOrder={1500} raycast={() => null}>
      <ringGeometry args={[.16, .22, 40]} />
      <meshBasicMaterial color="#fff6e6" transparent opacity={.5} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh ref={blink} visible={false} renderOrder={100001} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[.2, 16, 12]} />
      <meshBasicMaterial color="black" side={THREE.BackSide} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  </>;
}
