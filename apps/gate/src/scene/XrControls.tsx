// The few things a person can reach for in the headset, as a small dock under the captions (point and pull the
// trigger, or pinch): add a photo, rest or resume, and leave the memory. The page's own buttons can't be seen in
// immersive VR, and the Quest can't open a file picker there, so "Photo" offers the two ways that work: a phone
// joining the visit (open the same link; it offers to join, then Photo), or stepping out of VR to choose one here.
import { Text } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { flow } from '../flow/controller';
import { useGate } from '../state/store';
import { xrStore } from './xr';
import { useMemory } from '../flow/memory';

const _head = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _target = new THREE.Vector3();
/** A hand ray is on one of the dock's buttons (the dock never moves under it). */
const aimed = { n: 0 };

function pill(w: number, h: number): THREE.ShapeGeometry {
  const r = h / 2, s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return new THREE.ShapeGeometry(s, 24);
}

function Button({ label, x, y = 0, width = 0.17, onPress, day, testId }: { label: string; x: number; y?: number; width?: number; onPress: () => void; day: boolean; testId?: string }) {
  const geo = useMemo(() => pill(width, 0.062), [width]);
  const [hover, setHover] = useState(false);
  const press = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPress(); };
  return (
    <group position={[x, y, 0]} name={testId} onClick={press} onPointerEnter={() => { setHover(true); aimed.n++; }} onPointerLeave={() => { setHover(false); aimed.n = Math.max(0, aimed.n - 1); }}>
      {/* A hit area a little larger than the pill (hand rays waver); a hit on any part of the button is the button's:
          the handlers sit on the group, so aiming at its words (in front of the pill) presses it too. */}
      <mesh position={[0, 0, -0.001]}><planeGeometry args={[width + 0.06, 0.11]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} /></mesh>
      <mesh geometry={geo} renderOrder={1992}>
        <meshBasicMaterial color={day ? (hover ? '#1d1c2e' : '#ffffff') : hover ? '#f5f4ff' : '#1a1b33'} transparent opacity={hover ? 0.95 : 0.82} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <Text font={fontUrl} fontSize={0.026} anchorX="center" anchorY="middle" position={[0, 0.001, 0.002]} renderOrder={1993}
        color={day ? (hover ? '#ffffff' : '#1d1c2e') : hover ? '#0b0c1c' : '#f5f4ff'} material-depthTest={false} material-toneMapped={false}>
        {label}
      </Text>
    </group>
  );
}

export function XrControls() {
  const stage = useGate((s) => s.stage);
  const resting = useGate((s) => s.resting);
  const session = useGate((s) => s.session);
  const media = useGate((s) => s.media);
  const [photoCard, setPhotoCard] = useState(false);
  const cardGeo = useMemo(() => pill(0.62, 0.27), []);
  const group = useRef<THREE.Group>(null);
  const placed = useRef(false);
  const anchor = useRef({ x: 0, y: 0, z: 0, yaw: 0, set: false, stage: '' });
  const camera = useThree((s) => s.camera);
  const day = stage === 'forming' || stage === 'memory' || stage === 'leaving';
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    camera.getWorldPosition(_head);
    camera.getWorldQuaternion(_q);
    const yaw = _e.setFromQuaternion(_q, 'YXZ').y;
    // Ahead and low, close enough to reach: below where a ray held on the ground ahead passes to walk there (a little
    // higher and further, it sat right in their way). It stays put while
    // you look down at it and reach for it (a dock that followed every turn of the head was a moving target under the
    // hand), and comes round only once you've turned well away, walked off or stood up; never while a ray is on it.
    const a = anchor.current;
    if (a.stage !== stage) { a.stage = stage; a.set = false; } // each part of the visit starts it in front of you (resting doesn't)
    const turned = Math.abs(Math.atan2(Math.sin(yaw - a.yaw), Math.cos(yaw - a.yaw)));
    if (!a.set || (aimed.n === 0 && (turned > 0.8 || Math.hypot(_head.x - a.x, _head.z - a.z) > 0.6 || Math.abs(_head.y - a.y) > 0.3))) {
      Object.assign(a, { x: _head.x, y: _head.y, z: _head.z, yaw, set: true });
    }
    const ahead = 0.85;
    _target.set(a.x - Math.sin(a.yaw) * ahead, a.y - 0.8, a.z - Math.cos(a.yaw) * ahead);
    if (!placed.current) { g.position.copy(_target); placed.current = true; }
    g.position.lerp(_target, 1 - Math.exp(-dt * 4));
    g.lookAt(a.x, g.position.y + 0.25, a.z);
  });
  const show = stage === 'greeting' || stage === 'gathering' || stage === 'memory' || resting;
  if (!show) return null;
  const buttons: { label: string; onPress: () => void; id: string }[] = [];
  if (resting) buttons.push({ label: 'Resume', id: 'xr-resume', onPress: () => void flow.resume() });
  else {
    if (stage === 'gathering' && !media) buttons.push({ label: 'Photo', id: 'xr-photo', onPress: () => setPhotoCard((v) => !v) });
    buttons.push({ label: 'Rest', id: 'xr-rest', onPress: () => void flow.rest() });
    if (stage === 'memory') buttons.push({ label: useMemory.getState().shared ? 'Back' : 'Leave', id: 'xr-leave', onPress: () => void flow.leave() });
  }
  const gap = 0.19;
  const x0 = -((buttons.length - 1) * gap) / 2;
  const card = photoCard && stage === 'gathering' && !media && !resting;
  return (
    <group ref={group}>
      {buttons.map((b, i) => <Button key={b.id} testId={b.id} label={b.label} x={x0 + i * gap} onPress={b.onPress} day={day} />)}
      {card && (
        <group position={[0, 0.2, -0.01]}>
          <mesh geometry={cardGeo} renderOrder={1990}>
            <meshBasicMaterial color="#0b0c1c" transparent opacity={0.78} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
          <Text font={fontUrl} fontSize={0.024} lineHeight={1.3} maxWidth={0.52} anchorX="center" anchorY="middle" textAlign="center" position={[0, 0.045, 0.002]}
            color="#f5f4ff" renderOrder={1991} material-depthTest={false} material-toneMapped={false}>
            {session ? 'From a phone: open this same link on it. It offers to join this visit; then tap Photo there.' : 'Step out of the headset for a moment to choose a photo here.'}
          </Text>
          <Button label="Choose one here" x={0} y={-0.07} width={0.28} day={false} testId="xr-photo-here" onPress={() => {
            // Out of VR, the page's Photo button (and the Quest's file picker) are right there.
            setPhotoCard(false);
            useGate.getState().set({ offers: { photo: true, video: true, invite: !!useGate.getState().session } });
            void xrStore.getState().session?.end().catch(() => undefined);
          }} />
        </group>
      )}
    </group>
  );
}
