// What the headset needs that the page can't show: the companion's words as calm 3D captions under your line of
// sight, a small dock of things to reach for (XrControls), and controller buttons for the same. Everything else is voice.
//   A: begin / continue    B: rest or resume    menu (left) or thumbstick press: leave the memory
// When the album is ready the headset session ends, so the album is waiting on the page in Quest Browser.
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR, useXRInputSourceState } from '@react-three/xr';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { flow } from '../flow/controller';
import { useGate } from '../state/store';
import { xrStore } from './xr';
import { XrControls } from './XrControls';

const _head = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _target = new THREE.Vector3();

function Captions3D() {
  const said = useGate((s) => s.companionLine);
  const heard = useGate((s) => s.heardLine);
  const stage = useGate((s) => s.stage);
  const thinking = useGate((s) => s.mood === 'thinking');
  const group = useRef<THREE.Group>(null);
  const plate = useRef<THREE.MeshBasicMaterial>(null);
  const camera = useThree((s) => s.camera);
  const day = stage === 'forming' || stage === 'memory' || stage === 'leaving';
  const placed = useRef(false);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    camera.getWorldPosition(_head);
    camera.getWorldQuaternion(_q);
    const yaw = _e.setFromQuaternion(_q, 'YXZ').y;
    // Below the line of sight, about a metre and a quarter ahead, following lazily (never head-locked).
    _target.set(_head.x - Math.sin(yaw) * 1.25, _head.y - 0.43, _head.z - Math.cos(yaw) * 1.25);
    if (!placed.current) { g.position.copy(_target); placed.current = true; }
    g.position.lerp(_target, 1 - Math.exp(-dt * 1.4));
    g.lookAt(_head.x, g.position.y, _head.z);
    if (plate.current) plate.current.opacity = THREE.MathUtils.damp(plate.current.opacity, said ? (day ? 0.72 : 0.55) : 0, 3, dt);
  });
  if (stage === 'portal' || stage === 'album') return null;
  const ink = day ? '#1d1c2e' : '#f5f4ff';
  return (
    <group ref={group}>
      <mesh position={[0, -0.06, -0.01]} renderOrder={1990}>
        <planeGeometry args={[0.86, 0.3]} />
        <meshBasicMaterial ref={plate} color={day ? '#ffffff' : '#0b0c1c'} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {said && (
        <Text font={fontUrl} fontSize={0.04} lineHeight={1.25} maxWidth={0.78} anchorX="center" anchorY="top" textAlign="center" position={[0, 0.06, 0]} color={ink} renderOrder={1991} material-depthTest={false} material-toneMapped={false}>
          {said.text}
        </Text>
      )}
      {heard && (
        <Text font={fontUrl} fontSize={0.026} maxWidth={0.78} anchorX="center" anchorY="top" textAlign="center" position={[0, -0.13, 0]} color={day ? '#4a4864' : '#c9c6e6'} renderOrder={1991} material-depthTest={false} material-toneMapped={false}>
          {`“${heard.text}”${!heard.interim && thinking ? '   …' : ''}`}
        </Text>
      )}
    </group>
  );
}

function Buttons() {
  const right = useXRInputSourceState('controller', 'right');
  const left = useXRInputSourceState('controller', 'left');
  const was = useRef<Record<string, boolean>>({});
  useFrame(() => {
    const pressed = (id: string, src: typeof right) => src?.gamepad?.[id]?.state === 'pressed';
    const edge = (key: string, now: boolean) => { const fire = now && !was.current[key]; was.current[key] = now; return fire; };
    const g = useGate.getState();
    if (edge('a', pressed('a-button', right))) {
      if (g.stage === 'portal') void flow.begin();
      else if (g.resting) void flow.resume();
    }
    if (edge('b', pressed('b-button', right))) { if (g.resting) void flow.resume(); else if (g.stage !== 'portal' && g.stage !== 'album') void flow.rest(); }
    const leave = pressed('menu', left) || pressed('xr-standard-thumbstick', right);
    if (edge('leave', leave) && (g.stage === 'memory' || g.stage === 'forming')) void flow.leave();
  });
  return null;
}

/** Counts rendered frames (diagnostics for the headset rehearsal: frames advancing = the XR loop is drawing). */
function FrameCounter() {
  useFrame(() => { const w = window as unknown as { __gateFrames?: number }; w.__gateFrames = (w.__gateFrames ?? 0) + 1; });
  return null;
}

export function XrLayer() {
  const presenting = useXR((s) => s.session != null);
  const stage = useGate((s) => s.stage);
  // Entering the headset from the gate begins the conversation (the Enter tap was the gesture audio needs).
  useEffect(() => { if (presenting && useGate.getState().stage === 'portal') void flow.begin(); }, [presenting]);
  // The album lives on the page: leave the headset a moment after the album is ready.
  useEffect(() => {
    if (!presenting || stage !== 'album') return;
    const t = setTimeout(() => { void xrStore.getState().session?.end().catch(() => undefined); }, 3500);
    return () => clearTimeout(t);
  }, [presenting, stage]);
  if (!presenting) return <FrameCounter />;
  return (
    <>
      <FrameCounter />
      <Captions3D />
      <XrControls />
      <Buttons />
    </>
  );
}
