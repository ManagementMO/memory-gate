// What the headset needs that the page can't show: the companion's words as calm 3D captions under your line of
// sight, a small dock of things to reach for (XrControls), and controller buttons for the same. Everything else is voice.
//   A: begin / continue    B: rest or resume    menu (left) or thumbstick press: leave the memory
// Leaving a memory keeps you in the headset: the album opens there (XrAlbum), and so does the start you come back to.
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR, useXRInputSourceState } from '@react-three/xr';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { flow } from '../flow/controller';
import { useGate } from '../state/store';
import { XrAlbum } from './XrAlbum';
import { XrControls } from './XrControls';
import { useObjectWorkshop } from '../memory-objects/workshop';

const _head = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _target = new THREE.Vector3();

function Captions3D() {
  const said = useGate((s) => s.companionLine);
  const heard = useGate((s) => s.heardLine);
  const translations = useGate((s) => s.translatedMemories);
  const pages = useMemo(() => translations.flatMap((memory) => {
    const words = (memory.english ?? 'English translation is unavailable right now.').split(/\s+/);
    return Array.from({ length: Math.ceil(words.length / 28) }, (_, i) => `${memory.name} · In English\n${words.slice(i * 28, (i + 1) * 28).join(' ')}`);
  }), [translations]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
    if (pages.length < 2) return;
    const timer = setInterval(() => setPage((n) => (n + 1) % pages.length), 11_000);
    return () => clearInterval(timer);
  }, [pages]);
  const stage = useGate((s) => s.stage);
  const objectSource = useObjectWorkshop((s) => s.selected);
  const thinking = useGate((s) => s.mood === 'thinking');
  const group = useRef<THREE.Group>(null);
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
  });
  if (stage === 'portal' || stage === 'album' || (objectSource && (stage === 'memory' || stage === 'forming'))) return null;
  // Just the words, with a soft halo of the opposite tone so they read on sky, marble or white. The companion's
  // line grows upward from the middle and yours downward, so however long either is, they never collide.
  const ink = day ? '#1d1c2e' : '#f5f4ff';
  const halo = day ? '#ffffff' : '#0b0c1c';
  return (
    <group ref={group} name="CompanionCaptions">
      {said && (
        <Text font={fontUrl} fontSize={0.04} lineHeight={1.25} maxWidth={0.82} anchorX="center" anchorY="bottom" textAlign="center" position={[0, 0, 0]} color={ink}
          outlineWidth={0.0035} outlineBlur={0.009} outlineColor={halo} outlineOpacity={0.7} renderOrder={1991} material-depthTest={false} material-toneMapped={false}>
          {said.text}
        </Text>
      )}
      {(pages.length > 0 || heard) && (
        <Text font={fontUrl} fontSize={0.027} lineHeight={1.3} maxWidth={0.82} anchorX="center" anchorY="top" textAlign="center" position={[0, -0.03, 0]} color={day ? '#4a4864' : '#d9d6f2'}
          outlineWidth={0.003} outlineBlur={0.008} outlineColor={halo} outlineOpacity={0.6} renderOrder={1991} material-depthTest={false} material-toneMapped={false}>
          {pages[page] ?? pages[0] ?? (heard ? `“${heard.text}”${!heard.interim && thinking ? '   …' : ''}` : '')}
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
  // Entering the headset from the gate begins the conversation (the Enter tap was the gesture audio needs).
  useEffect(() => { if (presenting && useGate.getState().stage === 'portal') void flow.begin(); }, [presenting]);
  if (!presenting) return <FrameCounter />;
  return (
    <>
      <FrameCounter />
      <Captions3D />
      <XrControls />
      <XrAlbum />
      <Buttons />
    </>
  );
}
