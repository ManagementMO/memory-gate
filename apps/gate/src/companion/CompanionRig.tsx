// Places whichever companion is chosen. Flat screens: a fixed spot per stage, eased. XR: in the memory the companion
// keeps you company beside your line of sight, following lazily (never head-locked). It always turns to face you.
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { COMPANION_SPOT, MEDIA_SPOT } from '../scene/layout';
import { firstPersonActive } from '../social/firstPerson';
import { damp, dampVec3, easeInOutCubic } from '../scene/util';
import { LightCompanion } from './light/LightCompanion';
import { FigureCompanion } from './figure/FigureCompanion';
import { ContactShadow } from '../scene/ContactShadow';
import { SPOT, XR_MOVE_AT, walkCompanion } from '../scene/palace/plan';

const _target = new THREE.Vector3();
const _settle = new THREE.Vector3(0, 0.12, 0); // settles gently down into place as the memory forms
const _head = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export function CompanionRig() {
  const kind = useGate((s) => s.companion);
  const stage = useGate((s) => s.stage);
  const outer = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pos = useRef(COMPANION_SPOT.portal.clone());
  const yaw = useRef(0);
  const scale = useRef(1.0);
  const lastStage = useRef<string>('portal');

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGate.getState();
    const day = s.stage === 'forming' || s.stage === 'memory' || s.stage === 'leaving';
    let rate = 1.8;
    let targetScale = 1.2;
    const palace = s.world === 'palace';
    if (palace && s.stage === 'entering') {
      if (gl.xr.isPresenting && s.enterProgress >= XR_MOVE_AT) {
        // Under the dome (the headset was carried here in the white): just ahead of you, rising into the light.
        camera.getWorldPosition(_head);
        camera.getWorldQuaternion(_q);
        const y = _e.setFromQuaternion(_q, 'YXZ').y;
        const rise = THREE.MathUtils.smoothstep(s.enterProgress, 0.5, 0.95) * 0.7;
        _target.set(_head.x - Math.sin(y) * 1.4, _head.y - 0.1 + rise, _head.z - Math.cos(y) * 1.4);
        if (pos.current.distanceTo(_target) > 8) pos.current.copy(_target);
      } else if (gl.xr.isPresenting) {
        _target.copy(SPOT.gathering).setZ(SPOT.gathering.z - s.enterProgress * 6);
      } else {
        walkCompanion(s.enterProgress, _target);
      }
      targetScale = 1.0;
      rate = 4;
    } else if (gl.xr.isPresenting && day) {
      // Beside and a little below the line of sight, about a metre ahead: to the left of the captions, clear of them.
      camera.getWorldPosition(_head);
      camera.getWorldQuaternion(_q);
      const y = _e.setFromQuaternion(_q, 'YXZ').y;
      _target.set(_head.x - Math.sin(y) * 1.05 - Math.cos(y) * 0.62, _head.y - 0.15, _head.z - Math.cos(y) * 1.05 + Math.sin(y) * 0.62);
      targetScale = 0.8;
      rate = 1.1;
    } else if (s.stage === 'entering') {
      const p = easeInOutCubic(Math.min(1, s.enterProgress * 1.15));
      _target.copy(s.media ? COMPANION_SPOT.gatheringWithMedia : COMPANION_SPOT.gathering).lerp(COMPANION_SPOT.entering, p);
      targetScale = 1.1 - p * 0.3;
      rate = 5;
    } else if (day && firstPersonActive()) {
      // Seeing through someone's eyes on a screen (social/firstPerson.ts): beside your line of sight as in the
      // headset, so it never stands between you and the other perspective across the room.
      camera.getWorldPosition(_head);
      camera.getWorldQuaternion(_q);
      const y = _e.setFromQuaternion(_q, 'YXZ').y;
      _target.set(_head.x - Math.sin(y) * 1.05 - Math.cos(y) * 0.62, _head.y - 0.15, _head.z - Math.cos(y) * 1.05 + Math.sin(y) * 0.62);
      targetScale = 0.8;
      rate = 1.6;
    } else if (day && s.photoWorld) {
      _target.set(-0.85, s.photoWorld.eye - 0.22, -1.35); // beside you, inside the photograph
      targetScale = s.companion === 'light' ? 1.1 : 0.85;
    } else if (day) {
      _target.copy(COMPANION_SPOT.memory);
      // On a portrait phone the companion comes in from the edge so it stays in view.
      const aspect = state.size.width / Math.max(1, state.size.height);
      if (aspect < 0.8) _target.set(-0.62, 1.02, -0.1);
      // The Light is mostly glow; on white it needs more presence to be found at a few metres.
      targetScale = (aspect < 0.8 ? 0.8 : 0.95) * (s.companion === 'light' ? 1.45 : 1);
      rate = s.stage === 'forming' ? 1.3 : 1.6;
    } else if (s.stage === 'gathering' || s.stage === 'greeting') {
      // In the palace the conversation happens across the lagoon, the companion a little higher in view.
      _target.copy(palace ? (s.media ? SPOT.gatheringWithMedia : SPOT.gathering) : s.media ? COMPANION_SPOT.gatheringWithMedia : COMPANION_SPOT.gathering);
      targetScale = 1.0;
    } else if (s.stage === 'album') {
      _target.copy(COMPANION_SPOT.album);
    } else {
      _target.copy(palace ? SPOT.portal : COMPANION_SPOT.portal);
      targetScale = 1.0;
    }
    // In the headset the companion keeps to the wearer's own eye height (seated or standing): its face just below
    // eye level wherever it is, except under the dome, where it rises into the light on its own.
    const underDome = palace && s.stage === 'entering' && s.enterProgress >= XR_MOVE_AT;
    if (gl.xr.isPresenting && !underDome && !day) {
      camera.getWorldPosition(_head);
      _target.y = _head.y - 0.19 * targetScale;
    }
    // As a memory begins to form (the screen is white), the companion is already beside you, settling in.
    if (!gl.xr.isPresenting && s.stage === 'forming' && lastStage.current !== 'forming') pos.current.copy(_target).add(_settle);
    lastStage.current = s.stage;
    // A change of world (or the album) moves the conversation far away: arrive there, don't fly.
    if (!gl.xr.isPresenting && s.stage !== 'entering' && pos.current.distanceTo(_target) > 12) pos.current.copy(_target);
    dampVec3(pos.current, _target, rate, dt);
    scale.current = damp(scale.current, targetScale, 2, dt);
    const t = state.clock.elapsedTime;
    if (outer.current) {
      // A slow hover: 0.21 Hz bob, a breath of sideways sway.
      outer.current.position.set(pos.current.x + Math.sin(t * 0.37) * 0.012, pos.current.y + Math.sin(t * 1.32) * 0.018, pos.current.z);
      outer.current.scale.setScalar(scale.current);
    }
    // Turn the whole body toward the viewer (yaw only); the figure aims its head and eyes itself.
    camera.getWorldPosition(_head);
    const want = Math.atan2(_head.x - pos.current.x, _head.z - pos.current.z);
    let delta = want - yaw.current;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    yaw.current += delta * (1 - Math.exp(-dt * 2.4));
    if (body.current) body.current.rotation.y = yaw.current;
    void MEDIA_SPOT;
  });

  const day = stage === 'forming' || stage === 'memory' || stage === 'leaving';
  const visible = stage !== 'album' && !(window as unknown as { __hideCompanion?: boolean }).__hideCompanion;
  return (
    <group ref={outer}>
      <group ref={body}>
        {kind === 'light' ? <LightCompanion visible={visible} onLight={day ? 1 : 0} /> : <FigureCompanion visible={visible} onLight={day ? 1 : 0} />}
      </group>
      <ContactShadow visible={day && visible} />
    </group>
  );
}
