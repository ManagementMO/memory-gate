import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { XROrigin, useXR, useXRInputSourceState } from '@react-three/xr';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import type { Perspective } from '../../../../packages/shared/src/redKite';
import { stepTransition, type MotionState, type Transition } from './motion';
import { VIEWPOINTS, viewpointYaw } from './viewpoints';
import { xrStore } from '../scene/xr';

export type SceneControls = {
  title: string; quote: string; paused: boolean; locked: boolean; canAdvance: boolean; proposal: boolean;
  onNext: () => void; onSwitch: () => void; onRest: () => void; onUse: () => void; onLeave: () => void; onPlay: () => void; onBreeze: () => void; onCompare: () => void;
};
function Button3D({ label, x, y, onClick, disabled = false }: { label: string; x: number; y: number; onClick: () => void; disabled?: boolean }) {
  return <group position={[x, y, .012]} onClick={e => { e.stopPropagation(); if (!disabled) onClick(); }}>
    <mesh><planeGeometry args={[.34, .095]} /><meshBasicMaterial color={disabled ? '#8f9486' : '#ede7d5'} /></mesh>
    <Text font={fontUrl} fontSize={.026} color="#26362d" maxWidth={.31} anchorX="center" anchorY="middle" position-z={.004}>{label}</Text>
  </group>;
}
function NativeControls({ controls: c }: { controls: SceneControls }) {
  const right = useXRInputSourceState('controller', 'right'), left = useXRInputSourceState('controller', 'left');
  const previous = useRef<Record<string, boolean>>({});
  useFrame(() => {
    const edge = (key: string, pressed: boolean) => { const fire = pressed && !previous.current[key]; previous.current[key] = pressed; return fire; };
    const pressed = (src: typeof right, key: string) => src?.gamepad?.[key]?.state === 'pressed';
    if (edge('a', pressed(right, 'a-button')) && !c.locked && c.canAdvance) c.onNext();
    if (edge('b', pressed(right, 'b-button'))) c.onRest();
    if (edge('x', pressed(left, 'x-button')) && !c.locked) c.onSwitch();
    if (edge('y', pressed(left, 'y-button'))) void xrStore.getState().session?.end();
  });
  return <group position={[0, .91, -1.65]}>
    <mesh position-z={-.008}><planeGeometry args={[1.16, .72]} /><meshBasicMaterial color="#23392f" transparent opacity={.93} /></mesh>
    <Text font={fontUrl} fontSize={.032} color="#ecd4a0" position={[0, .28, .002]} maxWidth={1.05} onClick={e => { e.stopPropagation(); if (!c.locked) c.onPlay(); }}>{c.title + ' · ▷ voice'}</Text>
    <Text font={fontUrl} fontSize={.037} lineHeight={1.25} color="#f5f0df" maxWidth={1.04} textAlign="center" anchorY="top" position={[0, .22, .002]}>{c.quote}</Text>
    <Button3D label="Other telling · X" x={-.38} y={-.11} onClick={c.onSwitch} disabled={c.locked} />
    <Button3D label={c.paused ? 'Continue · B' : 'Rest · B'} x={0} y={-.11} onClick={c.onRest} />
    <Button3D label="Next line · A" x={.38} y={-.11} onClick={c.onNext} disabled={c.locked || !c.canAdvance} />
    <Button3D label={c.proposal ? 'Use this look' : 'Both tellings'} x={-.38} y={-.24} onClick={c.proposal ? c.onUse : c.onCompare} disabled={c.locked} />
    <Button3D label={c.proposal ? 'Leave it open' : 'Sample voice'} x={0} y={-.24} onClick={c.proposal ? c.onLeave : c.onPlay} disabled={c.locked} />
    <Button3D label="Catch the breeze" x={.38} y={-.24} onClick={c.onBreeze} disabled={c.locked} />
    <Text font={fontUrl} fontSize={.021} color="#e1dbc7" position={[0, -.325, .004]} onClick={e => { e.stopPropagation(); void xrStore.getState().session?.end(); }}>Leave headset · Y</Text>
  </group>;
}

export function StoryView({ transition, motion, eye, paused, controls, onPerspective, onXR }: {
  transition: RefObject<Transition>; motion: RefObject<MotionState>; eye: number; paused: RefObject<boolean>; controls: SceneControls;
  onPerspective: (key: Perspective) => void; onXR: (presenting: boolean) => void;
}) {
  const camera = useThree(s => s.camera), gl = useThree(s => s.gl), scene = useThree(s => s.scene);
  const presenting = useXR(s => s.session != null);
  const origin = useRef<THREE.Group>(null), mask = useRef<THREE.Mesh>(null), maskMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const head = useRef(new THREE.Vector3()), frames = useRef(0), previous = useRef(transition.current.current);
  const moves = useRef<{ from: Perspective; to: Perspective; opacity: number; frame: number }[]>([]);
  useEffect(() => { onXR(presenting); }, [presenting, onXR]);
  useEffect(() => {
    const mapping = gl.toneMapping, background = scene.background;
    gl.toneMapping = THREE.NoToneMapping; scene.background = new THREE.Color('#a9bdc7');
    return () => { gl.toneMapping = mapping; scene.background = background; };
  }, [gl, scene]);
  useEffect(() => {
    const diagnostic = { emulator: () => new URLSearchParams(location.search).get('emulate') === '1' ? xrStore.getState().emulator : undefined,
      snapshot: () => ({ selected: transition.current.current, phase: transition.current.phase, fade: transition.current.opacity,
      camera: camera.position.toArray(), origin: origin.current?.position.toArray(), yaw: origin.current?.rotation.y,
      spoolScreen: new THREE.Vector3(...motion.current.spool).project(camera).toArray(), kite: scene.getObjectByName('RedKiteKite')?.position.toArray(),
      propsResting: scene.getObjectByName('RedKiteSpool')?.userData.resting,
      kiteRotation: scene.getObjectByName('RedKiteKite')?.rotation.toArray().slice(0, 3),
      tailRotation: scene.getObjectByName('Tail_08')?.rotation.toArray().slice(0, 3),
      xr: gl.xr.isPresenting, frames: frames.current, held: motion.current.held !== null, spool: [...motion.current.spool],
      simulationTime: motion.current.time, breeze: motion.current.breeze, grabs: motion.current.grabs, lifts: motion.current.lifts,
      moves: [...moves.current], inputSources: xrStore.getState().inputSourceStates.map(s => ({ type: s.type, hand: s.inputSource.handedness })) }) };
    const w = window as unknown as { __redKite3D?: typeof diagnostic }; w.__redKite3D = diagnostic;
    return () => { if (w.__redKite3D === diagnostic) delete w.__redKite3D; };
  }, [camera, gl, motion, transition, scene]);
  useFrame((_, dt) => {
    frames.current++;
    transition.current = stepTransition(transition.current, dt, paused.current);
    const t = transition.current, p = VIEWPOINTS[t.current];
    if (camera instanceof THREE.PerspectiveCamera && camera.far !== 1000) { camera.far = 1000; camera.fov = 78; camera.updateProjectionMatrix(); }
    if (origin.current) { origin.current.position.set(...p.feet); origin.current.rotation.y = viewpointYaw(p); }
    if (!gl.xr.isPresenting) { camera.position.set(p.feet[0], p.feet[1] + eye, p.feet[2]); camera.lookAt(...p.target); }
    if (previous.current !== t.current) { moves.current = [...moves.current.slice(-7), { from: previous.current, to: t.current, opacity: t.opacity, frame: frames.current }]; previous.current = t.current; onPerspective(t.current); }
    camera.getWorldPosition(head.current);
    if (mask.current) { mask.current.position.copy(head.current); mask.current.visible = t.opacity > 0; }
    if (maskMaterial.current) maskMaterial.current.opacity = t.opacity;
  }, -2);
  return <>
    <XROrigin ref={origin}>{presenting && <NativeControls controls={controls} />}</XROrigin>
    {/* A real scene mask covers both XR eyes; a DOM fade alone is invisible in immersive VR. */}
    <mesh ref={mask} renderOrder={100000} frustumCulled={false} visible={false} raycast={() => null}>
      <sphereGeometry args={[.18, 16, 12]} />
      <meshBasicMaterial ref={maskMaterial} color="black" side={THREE.BackSide} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  </>;
}
