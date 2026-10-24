// Places whichever companion is chosen. Flat screens: a fixed spot per stage, eased. XR: in the memory the companion
// keeps you company beside your line of sight, following lazily (never head-locked). It always turns to face you.
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGate } from '../state/store';
import { COMPANION_SPOT, MEDIA_SPOT } from '../scene/layout';
import { damp, dampVec3, easeInOutCubic } from '../scene/util';
import { LightCompanion } from './light/LightCompanion';
import { FigureCompanion } from './figure/FigureCompanion';
import { ContactShadow } from '../scene/ContactShadow';

const _target = new THREE.Vector3();
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

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useGate.getState();
    const day = s.stage === 'forming' || s.stage === 'memory' || s.stage === 'leaving';
    let rate = 1.8;
    let targetScale = 1.2;
    if (gl.xr.isPresenting && day) {
      // Beside and a little below the line of sight, about a metre ahead.
      camera.getWorldPosition(_head);
      camera.getWorldQuaternion(_q);
      const y = _e.setFromQuaternion(_q, 'YXZ').y;
      _target.set(_head.x - Math.sin(y) * 1.05 - Math.cos(y) * 0.45, _head.y - 0.22, _head.z - Math.cos(y) * 1.05 + Math.sin(y) * 0.45);
      targetScale = 0.8;
      rate = 1.1;
    } else if (s.stage === 'entering') {
      const p = easeInOutCubic(Math.min(1, s.enterProgress * 1.15));
      _target.copy(s.media ? COMPANION_SPOT.gatheringWithMedia : COMPANION_SPOT.gathering).lerp(COMPANION_SPOT.entering, p);
      targetScale = 1.1 - p * 0.3;
      rate = 5;
    } else if (day) {
      _target.copy(COMPANION_SPOT.memory);
      targetScale = 0.95;
      rate = s.stage === 'forming' ? 0.9 : 1.6;
    } else if (s.stage === 'gathering' || s.stage === 'greeting') {
      _target.copy(s.media ? COMPANION_SPOT.gatheringWithMedia : COMPANION_SPOT.gathering);
      targetScale = 1.0;
    } else if (s.stage === 'album') {
      _target.copy(COMPANION_SPOT.album);
    } else {
      _target.copy(COMPANION_SPOT.portal);
      targetScale = 1.0;
    }
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
  const visible = stage !== 'album';
  return (
    <group ref={outer}>
      <group ref={body}>
        {kind === 'light' ? <LightCompanion visible={visible} onLight={day ? 1 : 0} /> : <FigureCompanion visible={visible} onLight={day ? 1 : 0} />}
      </group>
      <ContactShadow visible={day && visible} />
    </group>
  );
}
