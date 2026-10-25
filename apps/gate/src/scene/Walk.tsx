// Stepping about a memory in the headset: in the meadow on its walking surface (the Red Kite collision mesh that
// Keira's walking, social/scene/Walking, loads and lifts onto the visible ground); anywhere else on the flat floor,
// inside the room, the clearing or the prepared world (social/walk keepInside):
//   hold a pinch or trigger on the ground for half a second, then let go: go there, behind a short blink (hands have no
//   sticks, so this is how a wearer without controllers walks)          left stick press: back to where you began
// A quick pinch on the ground still means "here" (placing things where you point). Standing in someone's perspective,
// Keira's walking owns the sticks and the step carries her anchor; anywhere else this walks with the sticks too:
//   left stick   walk where you look (about a slow stroll)       right stick   turn in 30° steps about your head
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useXRInputSourceState } from '@react-three/xr';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useMemory } from '../flow/memory';
import { useGate } from '../state/store';
import { keepInside, walk as socialWalk } from '../social/walk';
import { moveAnchor, perspectiveAnchored, reanchor, resetWalk, setWalk, walkState } from '../social/xr/perspectiveScale';
import type { MeadowTraversal } from '../red-kite/traversal';
import { splatEye } from './PhotoWorld';
import { WalkHint } from './WalkHint';

/** Places with a walking surface, and the frame their world is drawn in (fixtures/worlds/*.json): a backup copy of the
 *  surface comes from these when Keira's (which waits on the room's world from the backend) hasn't arrived. */
const SURFACES: Record<string, { collider: string; scale: number; floorY: number }> = {
  'red-kite': { collider: '/red-kite/meadow-collider.glb', scale: 2.6397884, floorY: -0.5775501930381995 },
};

async function loadSurface(s: { collider: string; scale: number; floorY: number }): Promise<MeadowTraversal> {
  const gltf = await new GLTFLoader().loadAsync(s.collider);
  gltf.scene.updateWorldMatrix(true, true);
  // The world's frame (PhotoWorld): OpenCV's half-turn about X, its scale, its camera at eye height.
  const frame = new THREE.Matrix4().makeRotationX(Math.PI).scale(new THREE.Vector3(s.scale, s.scale, s.scale));
  frame.setPosition(0, splatEye(s.floorY, s.scale), 0);
  const meshes: { vertices: Float32Array; indices: Uint32Array }[] = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(frame);
    const n = g.getAttribute('position').count;
    meshes.push({ vertices: Float32Array.from(g.getAttribute('position').array as ArrayLike<number>), indices: g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i) });
    g.dispose();
  });
  const { createTraversal } = await import('../red-kite/traversal');
  // normalizeSpawn lifts the collision mesh (only) so its ground under the entrance is the visible ground there.
  return createTraversal(meshes, { table: false });
}
/** What walking needs of a surface: the meadow's traversal, or the flat floor below. */
type Surface = Pick<MeadowTraversal, 'feet' | 'place' | 'step' | 'groundAt'>;

/** A showcase that says where its floor is (its scene's `walk`: [x0, z0, x1, z1] in its own metres: the living room
 *  inside its walls, the football field and its sidelines): steps stay on it. Null elsewhere. */
let placeBounds: ((x: number, z: number) => { x: number; z: number } | null) | null = null;
const SHOWCASES = import.meta.glob('../showcase/scenes/*.json', { eager: true, import: 'default' }) as Record<string, { walk?: [number, number, number, number] }>;
const inside = (x: number, z: number) => placeBounds?.(x, z) ?? keepInside(x, z);

/** A memory without a walking surface (a sketched room or clearing, a photo, the courtyard, a showcase): the floor is
 *  flat, and every step stays inside the place, as walking on a screen does. */
function flatSurface(): Surface {
  let at = { x: 0, z: 0 };
  return {
    get feet(): [number, number, number] { return [at.x, 0, at.z]; },
    place(p) { at = inside(p[0], p[2]); },
    step(d) { at = inside(at.x + d[0], at.z + d[1]); return [at.x, 0, at.z]; },
    groundAt: () => 0,
  };
}
const flat = flatSurface();
const _inv = new THREE.Matrix4(), _p = new THREE.Vector3();

const SPEED = 1.2; // metres a second
const TURN = Math.PI / 6;
const HOLD_S = 0.45; // a pinch held this long on the ground is a step there, not a "here"

/** The ground catcher (MemoryScene) hands its pointer events here; a hold becomes a step, a tap stays a point. */
export const walkPointer = {
  active: false,
  held: null as null | { id: number; t0: number; point: THREE.Vector3; away?: number },
  movedAt: -1e9,
  downs: 0, // diagnostics (scripts): ground presses seen
  down(e: ThreeEvent<PointerEvent>) { walkPointer.downs++; if (walkPointer.active) walkPointer.held = { id: e.pointerId, t0: performance.now(), point: e.point.clone() }; },
  move(e: ThreeEvent<PointerEvent>) { const h = walkPointer.held; if (h && h.id === e.pointerId) { h.point.copy(e.point); h.away = undefined; } },
  up(e: ThreeEvent<PointerEvent>) {
    const h = walkPointer.held;
    walkPointer.held = null;
    if (h && h.id === e.pointerId && performance.now() - h.t0 >= HOLD_S * 1000) walkPointer.request = h.point.clone();
  },
  // Off the ground mid-hold: it ends a moment later, unless the ray comes back to the ground or onto one of the dialogue's
  // buttons (they hang in front and follow the head, so one can pass under a held ray), where the hold carries on.
  leave(e: ThreeEvent<PointerEvent>) { const h = walkPointer.held; if (h && h.id === e.pointerId) h.away = performance.now(); },
  request: null as THREE.Vector3 | null,
  /** True just after a hold became a step (its click is not a "here"). */
  justMoved: () => performance.now() - walkPointer.movedAt < 600,
};

const _head = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _local = new THREE.Vector3();
if (new URLSearchParams(location.search).get('emulate') === '1') (window as unknown as { __walk?: unknown }).__walk = walkPointer; // diagnostics

export function Walk() {
  const place = useMemory((s) => s.place);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const left = useXRInputSourceState('controller', 'left');
  const right = useXRInputSourceState('controller', 'right');

  const st = useRef({ epoch: -1, surface: null as Surface | null, start: [0, 0, 0] as [number, number, number], pivotX: 0, pivotZ: 0, turnArmed: true, backWas: false, blink: 0, blinkDir: 0, pending: null as null | (() => void) });
  const ring = useRef<THREE.Mesh>(null);
  const blink = useRef<THREE.Mesh>(null);
  // The backup surface: only if Keira's hasn't arrived a few seconds after the place is chosen.
  const surfaceDef = place ? SURFACES[place] : undefined;
  const [own, setOwn] = useState<MeadowTraversal | null>(null);
  // A showcase's own floor: its scene (the group Showcase stands where you are) maps its metres to the world's.
  const showcase = useMemory((s) => s.showcase);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const area = showcase ? SHOWCASES[`../showcase/scenes/${showcase}.json`]?.walk : undefined;
    if (!area) { placeBounds = null; return; }
    placeBounds = (x, z) => {
      const frame = scene.getObjectByName('showcase')?.children[0];
      if (!frame) return null; // not built yet: as any memory
      frame.updateWorldMatrix(true, false);
      _p.set(x, 0, z).applyMatrix4(_inv.copy(frame.matrixWorld).invert());
      _p.x = THREE.MathUtils.clamp(_p.x, area[0], area[2]);
      _p.z = THREE.MathUtils.clamp(_p.z, area[1], area[3]);
      _p.applyMatrix4(frame.matrixWorld);
      return { x: _p.x, z: _p.z };
    };
    return () => { placeBounds = null; };
  }, [showcase, scene]);
  useEffect(() => {
    if (!surfaceDef) return;
    let live = true, made: MeadowTraversal | null = null;
    const t = setTimeout(() => {
      if (socialWalk.traversal) return;
      loadSurface(surfaceDef).then((s) => { if (live) { made = s; setOwn(s); } else s.dispose(); }).catch((e) => console.warn('[walk] no walking surface', e));
    }, 4000);
    return () => { live = false; clearTimeout(t); setOwn(null); made?.dispose(); resetWalk(); };
  }, [surfaceDef]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    // The meadow waits for its real ground (a flat floor there would put feet in the hill); elsewhere the floor is flat.
    const surface: Surface | null = socialWalk.traversal ?? own ?? (surfaceDef ? null : flat);
    const on = !!surface && gl.xr.isPresenting && useGate.getState().stage === 'memory' && !useGate.getState().resting;
    walkPointer.active = on;
    if (!on || !surface) { if (ring.current) ring.current.visible = false; if (blink.current) blink.current.visible = false; return; }
    const origin = camera.parent;
    camera.getWorldPosition(_head);
    const yaw = _e.setFromQuaternion(camera.getWorldQuaternion(_q), 'YXZ').y;
    const anchoredNow = perspectiveAnchored();
    const w = walkState();
    // A fresh placement (a new memory, another perspective, a recentre, the meadow's ground arriving): start walking
    // from where the head is now.
    if (!anchoredNow && (s.epoch !== w.epoch || s.surface !== surface)) {
      try { surface.place([_head.x - w.x, 0, _head.z - w.z]); } catch { return; } // outside the walkable ground: stay
      s.epoch = w.epoch; s.surface = surface; s.start = [...surface.feet] as [number, number, number]; s.pivotX = 0; s.pivotZ = 0;
    }
    const apply = () => { const f = surface.feet; setWalk(f[0] - s.start[0] + s.pivotX, f[1], f[2] - s.start[2] + s.pivotZ, walkState().yaw); };

    // The blink: out, the move happens behind it, back in.
    if (s.blinkDir !== 0) {
      s.blink = THREE.MathUtils.clamp(s.blink + s.blinkDir * dt / (s.blinkDir > 0 ? 0.12 : 0.2), 0, 1);
      if (s.blink >= 1 && s.blinkDir > 0) { s.pending?.(); s.pending = null; s.blinkDir = -1; }
      else if (s.blink <= 0 && s.blinkDir < 0) s.blinkDir = 0;
    }
    if (blink.current) {
      blink.current.visible = s.blink > 0.01;
      blink.current.position.copy(_head);
      (blink.current.material as THREE.MeshBasicMaterial).opacity = s.blink;
    }
    const startBlink = (move: () => void) => { if (s.blinkDir === 0) { s.pending = move; s.blinkDir = 1; } };

    // Left stick: walk where you look (in someone's perspective, Keira's walking does this).
    const stick = left?.gamepad?.['xr-standard-thumbstick'];
    const lx = stick?.xAxis ?? 0, ly = stick?.yAxis ?? 0;
    const mag = Math.hypot(lx, ly);
    if (!anchoredNow && mag > 0.15 && s.blinkDir === 0) {
      const k = ((mag - 0.15) / 0.85) * SPEED * dt / mag;
      const fwd = -ly * k, side = lx * k;
      surface.step([side * Math.cos(yaw) - fwd * Math.sin(yaw), -side * Math.sin(yaw) - fwd * Math.cos(yaw)], dt);
      apply();
    }
    // Left stick press: back to where you began.
    const back = stick?.state === 'pressed';
    if (back && !s.backWas) startBlink(() => {
      if (anchoredNow && origin) {
        // Back onto the perspective's own spot, facing the other one; Keira's walking finds the ground there again.
        _local.copy(_head); origin.worldToLocal(_local);
        reanchor({ x: _local.x, z: _local.z, yaw: yaw - origin.rotation.y });
        socialWalk.key = '';
      } else { surface.place([s.start[0], 0, s.start[2]]); s.pivotX = 0; s.pivotZ = 0; setWalk(0, surface.feet[1], 0, 0); }
    });
    s.backWas = back;

    // Right stick: turn in steps, about the head (so the turn never moves you).
    const rx = right?.gamepad?.['xr-standard-thumbstick']?.xAxis ?? 0;
    if (Math.abs(rx) < 0.3) s.turnArmed = true;
    else if (!anchoredNow && s.turnArmed && Math.abs(rx) > 0.6 && origin) {
      s.turnArmed = false;
      _local.copy(_head); origin.worldToLocal(_local);
      const kx = _local.x * origin.scale.x, kz = _local.z * origin.scale.z;
      const before = origin.rotation.y, after = before - Math.sign(rx) * TURN;
      const hx = (a: number) => kx * Math.cos(a) + kz * Math.sin(a), hz = (a: number) => -kx * Math.sin(a) + kz * Math.cos(a);
      s.pivotX += hx(before) - hx(after);
      s.pivotZ += hz(before) - hz(after);
      const v = walkState();
      setWalk(v.x + hx(before) - hx(after), v.y, v.z + hz(before) - hz(after), v.yaw + (after - before));
    }

    // A pinch or trigger held on the ground: the ring fills; letting go steps there. Off the ground for a moment: it ends.
    if (walkPointer.held?.away !== undefined && performance.now() - walkPointer.held.away > 150) walkPointer.held = null;
    const held = walkPointer.held;
    if (ring.current) {
      ring.current.visible = !!held;
      if (held) {
        const p = Math.min(1, (performance.now() - held.t0) / (HOLD_S * 1000));
        const g = surface.groundAt(held.point.x, held.point.z, _head.y + 1, 12);
        ring.current.position.set(held.point.x, (g ?? held.point.y) + 0.02, held.point.z);
        ring.current.scale.setScalar(0.5 + 0.5 * p);
        (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.6 * p;
      }
    }
    const target = walkPointer.request;
    if (target) {
      walkPointer.request = null;
      walkPointer.movedAt = performance.now();
      const f = surface.feet;
      // Land the head (not the play space's middle) on the chosen spot (on a flat floor, the nearest one inside the place).
      const to = surface === flat ? inside(target.x, target.z) : { x: target.x, z: target.z };
      const dx = to.x - _head.x, dz = to.z - _head.z;
      startBlink(() => {
        if (anchoredNow) {
          // Carry Keira's anchor (her walking's capsule rejoins the head by itself), onto the ground there.
          const ground = surface.groundAt(to.x, to.z, _head.y + 1, 12);
          if (ground !== null) moveAnchor(dx, dz, ground);
          return;
        }
        try { surface.place([f[0] + dx, f[1], f[2] + dz]); apply(); } catch { /* not walkable there: stay */ }
      });
    }
  });

  return (
    <>
      <WalkHint id="memory-walk" text="Hold a pinch on the ground to walk there" when={() => walkPointer.active} />
      {/* Neither the ring nor the blink takes a ray: the ground (and the buttons) behind them must still get it. */}
      <mesh ref={ring} visible={false} rotation-x={-Math.PI / 2} renderOrder={1500} raycast={() => null}>
        <ringGeometry args={[0.16, 0.22, 40]} />
        <meshBasicMaterial color="#fff6e6" transparent opacity={0.5} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={blink} visible={false} renderOrder={3001} raycast={() => null}>
        <sphereGeometry args={[0.3, 24, 16]} />
        <meshBasicMaterial color="#f2f1f8" side={THREE.BackSide} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </>
  );
}
