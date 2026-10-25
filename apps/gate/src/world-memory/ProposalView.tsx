// How you look and walk around the proposal memory: a trimmed copy of the Red Kite page's view (red-kite/StoryScene.tsx
// StoryView, left untouched), with the same feel: drag to look, WASD or arrows to walk (Shift runs, Space jumps), R
// fades back to where you arrived; on Quest the left stick walks, the right stick turns, pressing the left stick returns
// and Y leaves. What it leaves out is the Red Kite story itself: its in-headset story buttons, the spool, the second
// telling. It starts from the same checked spot on the path (red-kite/viewpoints.ts).
import { useFrame, useThree } from '@react-three/fiber';
import { XROrigin, useXR, useXRInputSourceState } from '@react-three/xr';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { stepTransition, type Transition } from '../red-kite/motion';
import { VIEWPOINTS, viewpointYaw } from '../red-kite/viewpoints';
import { initialNavigation, lookAround, stepNavigation, type WalkInput } from '../red-kite/navigation';
import type { MeadowTraversal } from '../red-kite/traversal';
import { xrStore } from '../scene/xr';

const MOVEMENT = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyR']);
const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest('button, input, textarea, select, summary, a, [contenteditable="true"]');

export function ProposalView({ transition, eye, navigationBlocked, recenter, traversal, touch, onHome, onXR }: {
  transition: RefObject<Transition>; eye: number; navigationBlocked: RefObject<boolean>; recenter: RefObject<number>;
  traversal: RefObject<MeadowTraversal | null>; touch: RefObject<WalkInput>; onHome: () => void; onXR: (presenting: boolean) => void;
}) {
  const camera = useThree((s) => s.camera), gl = useThree((s) => s.gl), scene = useThree((s) => s.scene);
  const presenting = useXR((s) => s.session != null);
  const left = useXRInputSourceState('controller', 'left'), right = useXRInputSourceState('controller', 'right');
  const origin = useRef<THREE.Group>(null), mask = useRef<THREE.Mesh>(null), maskMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const head = useRef(new THREE.Vector3()), previous = useRef(transition.current.current);
  const navigation = useRef(initialNavigation()), keys = useRef(new Set<string>()), jump = useRef(false);
  const physicsSeen = useRef<MeadowTraversal | null>(null), homeRef = useRef(onHome);
  useLayoutEffect(() => { homeRef.current = onHome; }, [onHome]);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const centered = useRef(recenter.current), wasXR = useRef(false), pivot = useRef(new THREE.Vector2());
  const localHead = useRef(new THREE.Vector3()), rotation = useRef(new THREE.Quaternion()), angles = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const buttons = useRef<Record<string, boolean>>({});
  useEffect(() => { onXR(presenting); }, [presenting, onXR]);

  useEffect(() => {
    const canvas = gl.domElement, previousTabIndex = canvas.getAttribute('tabindex'), previousLabel = canvas.getAttribute('aria-label');
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Explore the hill. Drag to look; W A S D or arrow keys to walk; Shift to run; Space to jump; R to return to the path.');
    const keydown = (e: KeyboardEvent) => {
      if (!MOVEMENT.has(e.code) || e.ctrlKey || e.metaKey || e.altKey || editable(e.target) || navigationBlocked.current || gl.xr.isPresenting) return;
      e.preventDefault();
      if (e.code === 'KeyR') { if (!e.repeat) homeRef.current(); return; }
      if (e.code === 'Space') { if (!e.repeat) jump.current = true; return; }
      keys.current.add(e.code);
    };
    const keyup = (e: KeyboardEvent) => keys.current.delete(e.code);
    const endDrag = () => {
      const current = drag.current; drag.current = null;
      if (current) { try { canvas.releasePointerCapture(current.id); } catch { /* already released */ } }
    };
    const clear = () => { keys.current.clear(); jump.current = false; endDrag(); };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || navigationBlocked.current || gl.xr.isPresenting || drag.current) return;
      canvas.focus({ preventScroll: true });
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const current = drag.current;
      if (!current || e.pointerId !== current.id) return;
      if (navigationBlocked.current || gl.xr.isPresenting) { endDrag(); return; }
      navigation.current = lookAround(navigation.current, e.clientX - current.x, e.clientY - current.y);
      current.x = e.clientX; current.y = e.clientY;
    };
    const up = (e: PointerEvent) => { if (drag.current?.id === e.pointerId) endDrag(); };
    const hidden = () => { if (document.hidden) clear(); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    addEventListener('keydown', keydown); addEventListener('keyup', keyup); addEventListener('blur', clear);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clear(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
      removeEventListener('keydown', keydown); removeEventListener('keyup', keyup); removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', hidden);
      if (previousTabIndex === null) canvas.removeAttribute('tabindex'); else canvas.setAttribute('tabindex', previousTabIndex);
      if (previousLabel === null) canvas.removeAttribute('aria-label'); else canvas.setAttribute('aria-label', previousLabel);
    };
  }, [gl, navigationBlocked]);
  // The same light treatment as the Red Kite page: the meadow untouched by tone mapping, its sky colour behind it.
  useEffect(() => {
    const mapping = gl.toneMapping, background = scene.background;
    gl.toneMapping = THREE.NoToneMapping; scene.background = new THREE.Color('#a9bdc7');
    return () => { gl.toneMapping = mapping; scene.background = background; };
  }, [gl, scene]);

  useFrame((_, dt) => {
    // Quest: press the left stick to return to the path, Y to leave the headset view.
    const edge = (key: string, pressed: boolean) => { const fire = pressed && !buttons.current[key]; buttons.current[key] = pressed; return fire; };
    if (edge('home', left?.gamepad?.['xr-standard-thumbstick']?.state === 'pressed')) homeRef.current();
    if (edge('y', left?.gamepad?.['y-button']?.state === 'pressed')) void xrStore.getState().session?.end();

    transition.current = stepTransition(transition.current, dt, false);
    const t = transition.current, p = VIEWPOINTS[t.current];
    if (previous.current !== t.current || (centered.current !== recenter.current && t.phase === 'covered') || wasXR.current !== gl.xr.isPresenting || physicsSeen.current !== traversal.current) {
      navigation.current = initialNavigation(); pivot.current.set(0, 0); keys.current.clear(); drag.current = null;
      centered.current = recenter.current; wasXR.current = gl.xr.isPresenting;
      traversal.current?.place(p.feet); physicsSeen.current = traversal.current;
    }
    previous.current = t.current;
    if (camera instanceof THREE.PerspectiveCamera && camera.far !== 1000) { camera.far = 1000; camera.fov = 78; camera.updateProjectionMatrix(); }
    const baseYaw = viewpointYaw(p), oldYaw = baseYaw + navigation.current.yaw;
    const l = left?.gamepad?.['xr-standard-thumbstick'], r = right?.gamepad?.['xr-standard-thumbstick'];
    const isDown = (a: string, b: string) => (keys.current.has(a) || keys.current.has(b) ? 1 : 0);
    camera.getWorldQuaternion(rotation.current); const headYaw = angles.current.setFromQuaternion(rotation.current, 'YXZ').y;
    const before = navigation.current;
    const blocked = navigationBlocked.current || t.phase !== 'idle';
    navigation.current = stepNavigation(before, {
      right: gl.xr.isPresenting ? l?.xAxis ?? 0 : touch.current.right + isDown('KeyD', 'ArrowRight') - isDown('KeyA', 'ArrowLeft'),
      forward: gl.xr.isPresenting ? -(l?.yAxis ?? 0) : touch.current.forward + isDown('KeyW', 'ArrowUp') - isDown('KeyS', 'ArrowDown'),
      heading: gl.xr.isPresenting ? headYaw : oldYaw, turn: gl.xr.isPresenting ? r?.xAxis ?? 0 : 0,
      speed: gl.xr.isPresenting ? 1.2 : (keys.current.has('ShiftLeft') || keys.current.has('ShiftRight')) ? 3.2 : 1.8,
    }, dt, blocked);
    if (traversal.current) {
      const desired = navigation.current;
      const feet = traversal.current.step([desired.x - before.x, desired.z - before.z], dt, jump.current, blocked);
      navigation.current = { ...desired, x: feet[0] - p.feet[0], y: feet[1], z: feet[2] - p.feet[2] };
    }
    jump.current = false;
    const n = navigation.current, yaw = baseYaw + n.yaw;
    if (origin.current) {
      if (gl.xr.isPresenting && yaw !== oldYaw) {
        camera.getWorldPosition(localHead.current); origin.current.worldToLocal(localHead.current);
        const { x, z } = localHead.current;
        // Snap about the wearer's tracked head, not the middle of their physical play space.
        pivot.current.x += Math.cos(oldYaw) * x + Math.sin(oldYaw) * z - Math.cos(yaw) * x - Math.sin(yaw) * z;
        pivot.current.y += -Math.sin(oldYaw) * x + Math.cos(oldYaw) * z + Math.sin(yaw) * x - Math.cos(yaw) * z;
      }
      origin.current.position.set(p.feet[0] + n.x + pivot.current.x, n.y, p.feet[2] + n.z + pivot.current.y);
      origin.current.rotation.y = yaw;
    }
    if (!gl.xr.isPresenting) {
      camera.position.set(p.feet[0] + n.x, n.y + eye, p.feet[2] + n.z);
      const pitch = Math.atan2(p.target[1] - p.feet[1] - eye, Math.hypot(p.target[0] - p.feet[0], p.target[2] - p.feet[2]));
      camera.rotation.set(Math.max(-1.25, Math.min(1.25, pitch + n.pitch)), yaw, 0, 'YXZ');
    }
    camera.getWorldPosition(head.current);
    if (mask.current) { mask.current.position.copy(head.current); mask.current.visible = t.opacity > 0; }
    if (maskMaterial.current) maskMaterial.current.opacity = t.opacity;
  }, -2);

  return <>
    <XROrigin ref={origin} />
    {/* A real scene mask covers both XR eyes; a DOM fade alone is invisible in immersive VR. */}
    <mesh ref={mask} renderOrder={100000} frustumCulled={false} visible={false} raycast={() => null}>
      <sphereGeometry args={[0.18, 16, 12]} />
      <meshBasicMaterial ref={maskMaterial} color="black" side={THREE.BackSide} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  </>;
}
