// Walking about in the memory (walk.ts): the keys and the phone's walk pad on a screen, the sticks in the headset,
// turned into movement by the Red Kite controls and carried over the ground. In the meadow its real walking surface
// (the Red Kite collision mesh, loaded by its Terrain) keeps you on the ground and out of the trees.
import { useFrame, useThree } from '@react-three/fiber';
import { useXRInputSourceState } from '@react-three/xr';
import { useQuery } from 'convex/react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { api } from '../../../../../convex/_generated/api';
import { initialNavigation, stepNavigation } from '../../red-kite/navigation';
// Loaded only when a meadow opens: it brings the physics engine, which every page would otherwise download at start.
const Terrain = lazy(() => import('../../red-kite/Terrain').then((m) => ({ default: m.Terrain })));
import type { MeadowTraversal } from '../../red-kite/traversal';
import { xrStore } from '../../scene/xr';
import { useGate } from '../../state/store';
import { firstPersonActive, firstPersonPossible, lookHeading } from '../firstPerson';
import { worldSpot } from '../spots';
import { perspectiveOf, poses, useSocial, type PerspectiveKey } from '../store';
import { groundAt, keepApart, keepInside, walk, walkKey, walkPad } from '../walk';
import { MEADOW_WORLD_ID } from '../world';
import { moveAnchor, perspectiveAnchored, turnAnchor } from '../xr/perspectiveScale';

const MOVEMENT = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const editable = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"]');
/** In the headset, the stick's body has drifted this far from your head (you stepped about): it rejoins you. */
const REJOIN_M = 0.35;
// For the automated checks (like the Red Kite page's): where walking has got to, and with ?emulate=1 the emulated
// Quest's controllers, to push its sticks.
const w = window as unknown as { __social?: Record<string, unknown> };
w.__social = { ...(w.__social ?? {}), walk, emulator: () => (new URLSearchParams(location.search).get('emulate') === '1' ? xrStore.getState().emulator : undefined) };

const _head = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Everyone else standing in the memory: the others where they are, and the other perspective's stand-in at its spot
 *  while nobody is seeing through it (someone sharing your eyes shares your spot, so they don't count). */
function othersAround(): { x: number; z: number }[] {
  const s = useSocial.getState(), mine = perspectiveOf(s.viewing).id, now = Date.now();
  const live = [...poses.values()].filter((p) => p.memberId !== s.memberId && p.inScene && p.head.length === 7 && now - p.receivedAt < 5000);
  const people = live.filter((p) => p.perspectiveId !== mine).map((p) => ({ x: p.head[0]!, z: p.head[2]! }));
  const waiting = (['grandparent', 'child'] as PerspectiveKey[]).filter((k) => k !== s.viewing && !live.some((p) => p.perspectiveId === perspectiveOf(k).id));
  return [...people, ...waiting.map(worldSpot)];
}

/** The meadow's walking surface. The meadow is drawn with its floor where the world's own estimate puts it, which is
 *  where its splats' ground really is; the collision mesh sits about 1.15 m lower, and Terrain lifts it onto that
 *  ground (its `verticalShift`, tests/smoke/human-models.test.ts checks they meet). */
function MeadowGround() {
  const session = useGate((s) => s.session);
  const view = useQuery(api.rooms.get, session ? { code: session.code, token: session.token } : 'skip');
  const splat = view?.splat;
  const scale = splat?.scale, floorY = splat?.floorY ?? null;
  const source = useMemo(() => (scale ? { url: null, liteUrl: null, floorY, scale } : null), [scale, floorY]);
  const debug = useRef(false);
  const onReady = useCallback((w: MeadowTraversal | null) => {
    walk.traversal = w;
    walk.key = ''; // start again, on the real ground
  }, []);
  const onError = useCallback((e: string) => console.warn('[walk] walking on the flat instead:', e), []);
  if (!source) return null;
  return <Terrain source={source} debug={debug} onReady={onReady} onError={onError} />;
}

export function Walking() {
  const camera = useThree((s) => s.camera);
  const left = useXRInputSourceState('controller', 'left');
  const right = useXRInputSourceState('controller', 'right');
  const keys = useRef(new Set<string>());
  const nav = useRef(initialNavigation());
  const inMeadowWorld = useSocial((s) => s.worldId === MEADOW_WORLD_ID);
  const photoWorld = useGate((s) => !!s.photoWorld);
  const meadow = inMeadowWorld && photoWorld;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
      // From the overview, a walking key steps into your own eyes and walks, so the others see you move at once.
      if (!firstPersonActive() && MOVEMENT.has(e.code) && !e.code.startsWith('Shift') && firstPersonPossible()) useSocial.getState().set({ view: 'first' });
      if (!firstPersonActive()) return;
      if (e.code === 'KeyR') { if (!e.repeat) walk.key = ''; return; } // back to your spot
      if (!MOVEMENT.has(e.code)) return;
      e.preventDefault();
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => keys.current.clear();
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', clear);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', clear); };
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = useGate.getState();
    const placed = g.stage === 'memory' || g.stage === 'leaving';
    const xr = g.xr && perspectiveAnchored();
    const flat = !g.xr && firstPersonActive();
    if (!placed || (!xr && !flat)) { keys.current.clear(); return; }
    const t = walk.traversal;
    const viewing = useSocial.getState().viewing;
    const spot = worldSpot(viewing);
    const key = walkKey();
    if (key !== walk.key) {
      walk.key = key; walk.offset = { x: 0, z: 0 }; nav.current = initialNavigation();
      walk.y = groundAt(spot.x, spot.z);
      if (t) { try { t.place([spot.x, walk.y, spot.z]); walk.y = t.feet[1]; } catch { /* a spot off the walkable ground stays on the flat */ } }
      if (xr) moveAnchor(0, 0, walk.y);
    }
    const isDown = (a: string, b: string) => (keys.current.has(a) || keys.current.has(b) ? 1 : 0);
    const ls = left?.gamepad?.['xr-standard-thumbstick'], rs = right?.gamepad?.['xr-standard-thumbstick'];
    camera.getWorldQuaternion(_q);
    const start = { ...nav.current, x: 0, z: 0 };
    nav.current = stepNavigation(start, {
      right: xr ? ls?.xAxis ?? 0 : walkPad.current.right + isDown('KeyD', 'ArrowRight') - isDown('KeyA', 'ArrowLeft'),
      forward: xr ? -(ls?.yAxis ?? 0) : walkPad.current.forward + isDown('KeyW', 'ArrowUp') - isDown('KeyS', 'ArrowDown'),
      heading: xr ? _e.setFromQuaternion(_q, 'YXZ').y : lookHeading(),
      turn: xr ? rs?.xAxis ?? 0 : 0,
      speed: xr ? 1.2 : keys.current.has('ShiftLeft') || keys.current.has('ShiftRight') ? 2.8 : 1.5,
    }, dt, false);
    let dx = nav.current.x, dz = nav.current.z;
    const turnBy = nav.current.yaw - start.yaw;
    if (xr) camera.getWorldPosition(_head);
    if (dx || dz) [dx, dz] = keepApart(xr ? _head.x : spot.x + walk.offset.x, xr ? _head.z : spot.z + walk.offset.z, dx, dz, othersAround());
    if (flat) {
      if (t) {
        const f = t.step([dx, dz], dt);
        walk.offset = { x: f[0] - spot.x, z: f[2] - spot.z }; walk.y = f[1];
      } else if (dx || dz) {
        const at = keepInside(spot.x + walk.offset.x + dx, spot.z + walk.offset.z + dz);
        walk.offset = { x: at.x - spot.x, z: at.z - spot.z }; walk.y = 0;
      }
      return;
    }
    // The headset: the stick carries the origin (and you with it); stepping about carries only you.
    if (turnBy) turnAnchor(turnBy, _head);
    if (t) {
      const feet = t.feet;
      if (!dx && !dz) {
        if (Math.hypot(feet[0] - _head.x, feet[2] - _head.z) > REJOIN_M) { try { t.place([_head.x, feet[1], _head.z]); } catch { /* stepped off the walkable ground */ } }
        return;
      }
      const f = t.step([dx, dz], dt);
      moveAnchor(f[0] - feet[0], f[2] - feet[2], f[1]);
    } else if (dx || dz) {
      const at = keepInside(_head.x + dx, _head.z + dz);
      moveAnchor(at.x - _head.x, at.z - _head.z, 0);
    }
  });

  return meadow ? <Suspense fallback={null}><MeadowGround /></Suspense> : null;
}
