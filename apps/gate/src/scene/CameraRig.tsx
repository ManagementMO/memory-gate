// The flat-screen camera (phone, laptop, projector). In XR the headset owns the camera and this rig steps aside.
// Night: a still view up toward the gate with a breath of pointer/tilt parallax. Entering: a slow dolly through.
// Memory: an elevated view of the place that you can turn by dragging; it drifts back to centre when let go.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { MEMORY_CENTER } from './layout';
import { damp, dampVec3, easeInOutCubic } from './util';
import { useMemory } from '../flow/memory';
import { EYE, LOOK_Y, SHORE, albumView, walkView } from './palace/plan';
import { firstPersonActive, firstPersonView } from '../social/firstPerson';

const useMemoryWater = () => !!useMemory.getState().plan?.setting.water;

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
/** Diagnostics for visual work: ?cam=x,y,z,tx,ty,tz pins the flat camera (never used in normal visits). */
const PIN = (() => { const v = new URLSearchParams(location.search).get('cam')?.split(',').map(Number); return v && v.length === 6 && v.every(Number.isFinite) ? v : null; })();

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const pos = useRef(new THREE.Vector3(0, 1.55, 0));
  const look = useRef(new THREE.Vector3(0, 1.72, -4));
  const orbit = useRef({ az: 0, el: 0.26, targetAz: 0, targetEl: 0.26, dragging: false, x: 0, y: 0, idle: 0 });
  const tilt = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = gl.domElement;
    const day = () => ['forming', 'memory', 'leaving'].includes(useGate.getState().stage);
    const down = (e: PointerEvent) => {
      if (!day()) return;
      orbit.current.dragging = true; orbit.current.x = e.clientX; orbit.current.y = e.clientY;
    };
    const move = (e: PointerEvent) => {
      const o = orbit.current;
      if (!o.dragging) return;
      const w = el.clientWidth || 1;
      o.targetAz = THREE.MathUtils.clamp(o.targetAz - ((e.clientX - o.x) / w) * 2.4, -0.95, 0.95);
      o.targetEl = THREE.MathUtils.clamp(o.targetEl + ((e.clientY - o.y) / w) * 1.2, 0.08, 0.62);
      o.x = e.clientX; o.y = e.clientY; o.idle = 0;
    };
    const up = () => { orbit.current.dragging = false; };
    // Phones: a little parallax from tilting the device (no permission prompt needed on Android; iOS asks on Begin).
    const orient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      tilt.current.x = THREE.MathUtils.clamp(e.gamma / 35, -1, 1);
      tilt.current.y = THREE.MathUtils.clamp((e.beta - 45) / 35, -1, 1);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('deviceorientation', orient);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('deviceorientation', orient);
    };
  }, [gl]);

  useFrame((state, dtRaw) => {
    if (gl.xr.isPresenting) return;
    const dt = Math.min(dtRaw, 0.05);
    const s = useGate.getState();
    const px = state.pointer.x * 0.6 + tilt.current.x * 0.4;
    const py = state.pointer.y * 0.6 - tilt.current.y * 0.4;
    let fov = 50;
    let rate = 1.6;
    const palace = s.world === 'palace';
    if (palace && s.stage === 'entering') {
      // Across the lagoon on the stepping stones, through the great arch, then a look up into the dome's light.
      fov = walkView(s.enterProgress, _pos, _look);
      _pos.x += px * 0.04;
      _look.x += px * 0.3;
      rate = 5;
    } else if (palace && (s.stage === 'portal' || s.stage === 'greeting' || s.stage === 'gathering')) {
      // At the lagoon's edge, looking across the water to the rotunda; portrait phones step back for the whole dome.
      const aspect = state.size.width / Math.max(1, state.size.height);
      _pos.set(SHORE.x + px * 0.08, EYE + py * 0.04, SHORE.z);
      _look.set(SHORE.x + px * 0.4, LOOK_Y + py * 0.18, SHORE.z - 4);
      fov = aspect < 0.8 ? 62 : 50;
    } else if (s.stage === 'entering') {
      const p = easeInOutCubic(s.enterProgress);
      _pos.set(0, 1.55 + p * 0.12, -p * 3.2);
      _look.set(0, 1.7 + p * 0.1, -6);
      fov = 50 - p * 9;
      rate = 6;
    } else if (firstPersonActive()) {
      // Through someone's eyes: at your spot, at the perspective's eye height (social/firstPerson.ts).
      // Checked before the living photograph: first person declines single photos, but stands in prepared worlds.
      fov = firstPersonView(_pos, _look, state.size.width / Math.max(1, state.size.height));
      rate = 4;
    } else if (s.photoWorld && (s.stage === 'forming' || s.stage === 'memory' || s.stage === 'leaving')) {
      // A living photograph only looks right from where it was taken: stand there, with a breath of parallax.
      const eye = s.photoWorld.eye;
      _pos.set(px * 0.18 + tilt.current.x * 0.1, eye + py * 0.06, 0.05);
      _look.set(px * 0.6, eye - 0.08 + py * 0.25, -3);
      fov = 58;
      rate = 1.6;
    } else if (s.stage === 'forming' || s.stage === 'memory' || s.stage === 'leaving') {
      const o = orbit.current;
      if (!o.dragging) {
        o.idle += dt;
        // After a few untouched seconds, ease back toward the front view with a very slow sway.
        if (o.idle > 4) { o.targetAz = damp(o.targetAz, Math.sin(state.clock.elapsedTime * 0.05) * 0.18, 0.4, dt); o.targetEl = damp(o.targetEl, 0.26, 0.4, dt); }
      }
      o.az = damp(o.az, o.targetAz, 4, dt);
      o.el = damp(o.el, o.targetEl, 4, dt);
      // Frame the whole room: a little further back, a little lower, looking toward its back half. Portrait phones
      // step further back with a wider view so the room still fits across the narrow screen.
      const aspect = state.size.width / Math.max(1, state.size.height);
      const portrait = Math.min(1, Math.max(0.45, aspect));
      const r = 5.3 / Math.pow(portrait, 0.55);
      const cz = MEMORY_CENTER.z - 0.45;
      const lift = useMemoryWater() ? 0.55 : 0; // by water, look down a little more so the surface shows
      _pos.set(MEMORY_CENTER.x + Math.sin(o.az) * Math.cos(o.el) * r, 0.35 + lift + Math.sin(o.el) * r, cz + Math.cos(o.az) * Math.cos(o.el) * r);
      _look.set(MEMORY_CENTER.x, 0.72, cz);
      fov = aspect < 0.8 ? 64 : 54;
      rate = s.stage === 'forming' ? 1.1 : 2.2;
    } else if (palace && s.stage === 'album') {
      // The album rests on the palace: a view along the colonnade, across the lagoon to the rotunda.
      fov = albumView(state.clock.elapsedTime, state.size.width / Math.max(1, state.size.height), _pos, _look);
      rate = 1.2;
    } else if (s.stage === 'album') {
      _pos.set(0, 1.55, 0);
      _look.set(px * 0.6, 2.4 + py * 0.3, -4);
    } else {
      _pos.set(px * 0.06, 1.55 + py * 0.03, 0);
      _look.set(px * 0.32, 1.72 + py * 0.16, -4);
    }
    // Changing world (or coming back from the album) puts the view far away: arrive there, don't fly across.
    if (pos.current.distanceTo(_pos) > 12) { pos.current.copy(_pos); look.current.copy(_look); }
    if (PIN) { _pos.set(PIN[0]!, PIN[1]!, PIN[2]!); _look.set(PIN[3]!, PIN[4]!, PIN[5]!); pos.current.copy(_pos); look.current.copy(_look); }
    dampVec3(pos.current, _pos, rate, dt);
    dampVec3(look.current, _look, rate, dt);
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
    const nextFov = damp(camera.fov, fov, 3, dt);
    if (Math.abs(nextFov - camera.fov) > 0.001) { camera.fov = nextFov; camera.updateProjectionMatrix(); }
  });

  return null;
}
