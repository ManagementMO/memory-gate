// The headset side of perspectives, inside the XR origin (so everything here grows and shrinks with it):
//   X (left): see through the next perspective's eyes      Y (left): the wrist menu (perspectives, handoffs, ghosts)
//   hands: a small light on the left wrist opens the same menu with a pinch.
// Your eye height is measured once you stand in the headset (and again on entering a memory); changing perspective
// grows or shrinks the world around your feet behind a quick, soft blink so it never feels like being moved.
import { Text } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useXR, useXRInputSourceState, XRSpace } from '@react-three/xr';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { useGate } from '../../state/store';
import { handOver, respondHandoff, lastStoryOfViewing, otherPerspective } from '../handoffs';
import { cyclePerspective, setViewing } from '../perspectives';
import { useSocial, type PerspectiveKey } from '../store';
import { originScale, resetOriginScale, setOriginScale } from './perspectiveScale';

/** Where the hands are (world space, read by the pose publisher). Null when that hand isn't tracked. */
export const handAnchors: { left: THREE.Object3D | null; right: THREE.Object3D | null } = { left: null, right: null };
export const wristMenu = { open: false };

const MEASURE_S = 1.5;
const BLINK_OUT = 0.15;
const BLINK_IN = 0.25;
const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();

function median(a: number[]): number { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; }

/** The world scale that puts these measured eyes at the perspective's eye line (1 when already close). */
export function scaleFor(eye: number, measured: number): number {
  const k = eye / measured;
  if (Math.abs(k - 1) < 0.06) return 1;
  return THREE.MathUtils.clamp(k, 0.55, 1.4);
}

function Scaler({ anchor }: { anchor: React.RefObject<THREE.Group | null> }) {
  const camera = useThree((s) => s.camera);
  const presenting = useXR((s) => s.session != null);
  const blink = useRef<THREE.Mesh>(null);
  const st = useRef({ samples: [] as number[], since: 0, measuring: true, phase: 'idle' as 'idle' | 'out' | 'in', t: 0, target: 1, stage: '' });
  useEffect(() => {
    if (presenting) { st.current.measuring = true; st.current.samples = []; st.current.since = 0; return; }
    resetOriginScale();
    useSocial.getState().set({ xr: { measured: null, k: 1 } });
  }, [presenting]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const origin = anchor.current?.parent;
    if (!presenting || !origin) return;
    const s = st.current;
    camera.getWorldPosition(_head);
    origin.worldToLocal(_head); // real metres above your own floor
    // Measure again on entering a memory (people sit down at the gate, stand up inside, or the other way round).
    const stage = useGate.getState().stage;
    if (stage === 'forming' && s.stage !== 'forming') { s.measuring = true; s.samples = []; s.since = 0; }
    s.stage = stage;
    if (s.measuring && _head.y > 0.3) {
      s.samples.push(_head.y); s.since += dt;
      if (s.since >= MEASURE_S) { s.measuring = false; useSocial.getState().set({ xr: { measured: median(s.samples), k: originScale() } }); }
    }
    const measured = useSocial.getState().xr.measured;
    if (measured && s.phase === 'idle') {
      const target = scaleFor(useSocial.getState().perspectives.find((p) => p.key === useSocial.getState().viewing)?.eyeHeight ?? 1.6, measured);
      if (Math.abs(target - originScale()) > 0.01) { s.phase = 'out'; s.t = 0; s.target = target; }
    }
    if (s.phase === 'out') {
      s.t += dt;
      if (s.t >= BLINK_OUT) { setOriginScale(s.target, _head); useSocial.getState().set({ xr: { measured, k: s.target } }); s.phase = 'in'; s.t = 0; }
    } else if (s.phase === 'in') {
      s.t += dt;
      if (s.t >= BLINK_IN) s.phase = 'idle';
    }
    const m = blink.current;
    if (m) {
      const a = s.phase === 'out' ? s.t / BLINK_OUT : s.phase === 'in' ? 1 - s.t / BLINK_IN : 0;
      m.visible = a > 0.01;
      (m.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(a, 0, 1);
      m.position.copy(_head);
    }
  });
  return (
    <mesh ref={blink} visible={false} renderOrder={3000}>
      <sphereGeometry args={[0.3, 24, 16]} />
      <meshBasicMaterial color="#f2f1f8" side={THREE.BackSide} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

function Buttons({ setMenu }: { setMenu: (f: (v: boolean) => boolean) => void }) {
  const left = useXRInputSourceState('controller', 'left');
  const was = useRef<Record<string, boolean>>({});
  useFrame(() => {
    const pressed = (id: string) => left?.gamepad?.[id]?.state === 'pressed';
    const edge = (key: string, now: boolean) => { const fire = now && !was.current[key]; was.current[key] = now; return fire; };
    if (edge('x', pressed('x-button'))) cyclePerspective();
    if (edge('y', pressed('y-button'))) setMenu((v) => !v);
  });
  return null;
}

/** "Seeing through the grandchild's eyes": for a moment, just above your line of sight. */
function Label({ anchor }: { anchor: React.RefObject<THREE.Group | null> }) {
  const notice = useSocial((s) => s.notice);
  const camera = useThree((s) => s.camera);
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const origin = anchor.current?.parent;
    if (!g.current || !origin) return;
    const fresh = !!notice && Date.now() - notice.at < 2500;
    g.current.visible = fresh;
    if (!fresh) return;
    camera.getWorldPosition(_head); camera.getWorldQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q).setY(0).normalize();
    origin.worldToLocal(_head);
    g.current.position.set(_head.x + _fwd.x * 1.1, _head.y + 0.14, _head.z + _fwd.z * 1.1);
    g.current.lookAt(origin.localToWorld(_head.clone()));
  });
  return (
    <group ref={g} visible={false}>
      <Text font={fontUrl} fontSize={0.036} maxWidth={0.9} anchorX="center" anchorY="middle" textAlign="center" color="#2a2840" outlineWidth={0.004} outlineColor="#ffffff" renderOrder={1995} material-depthTest={false} material-toneMapped={false}>
        {notice?.text ?? ''}
      </Text>
    </group>
  );
}

type RowProps = { y: number; text: string; onSelect: () => void; on?: boolean; color?: string; testId?: string };
function Row({ y, text, onSelect, on, color }: RowProps) {
  const [hover, setHover] = useState(false);
  const pick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); };
  return (
    <group position={[0, y, 0]}>
      <mesh onClick={pick} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)} userData={{ noPoint: true }}>
        <planeGeometry args={[0.24, 0.034]} />
        <meshBasicMaterial color={on ? '#ffffff' : hover ? '#f3f1fb' : '#e7e5f2'} transparent opacity={0.94} toneMapped={false} />
      </mesh>
      {color && (
        <mesh position={[-0.106, 0, 0.001]}>
          <circleGeometry args={[0.007, 20]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      )}
      <Text font={fontUrl} fontSize={0.0135} maxWidth={0.2} anchorX="left" anchorY="middle" position={[-0.092, 0, 0.002]} color="#24223a" material-toneMapped={false}>
        {text}
      </Text>
    </group>
  );
}

function MenuPanel({ onClose }: { onClose: () => void }) {
  const camera = useThree((s) => s.camera);
  const face = useRef<THREE.Group>(null);
  const perspectives = useSocial((s) => s.perspectives);
  const viewing = useSocial((s) => s.viewing);
  const ghosts = useSocial((s) => s.ghosts);
  const handoffs = useSocial((s) => s.handoffs);
  const stories = useSocial((s) => s.stories);
  const live = useSocial((s) => s.status === 'live');
  useFrame(() => { if (face.current) face.current.lookAt(camera.getWorldPosition(_head)); });
  const mine = perspectives.find((p) => p.key === viewing);
  const incoming = handoffs.filter((h) => h.status === 'pending' && h.toPerspectiveId === mine?.id).slice(0, 2);
  const last = lastStoryOfViewing();
  const other = otherPerspective();
  const rows: RowProps[] = [
    ...perspectives.map((p) => ({ y: 0, text: `${p.label}${p.claimedName ? ` · ${p.claimedName}` : ''}`, on: p.key === viewing, color: p.color, onSelect: () => setViewing(p.key as PerspectiveKey) })),
    { y: 0, text: ghosts ? 'Hide what others remember' : 'Show what others remember', onSelect: () => useSocial.getState().set({ ghosts: !ghosts }) },
    ...(live && last && other ? [{ y: 0, text: `Hand my last memory to the ${other.label.toLowerCase()}`, onSelect: () => void handOver(last.id, other.id) }] : []),
    ...incoming.flatMap((h) => {
      const s = stories.find((x) => x.id === h.storyId);
      return [
        { y: 0, text: `${h.senderName}: “${(s?.text ?? '').slice(0, 40)}${(s?.text.length ?? 0) > 40 ? '…' : ''}”`, onSelect: () => useSocial.getState().set({ openStory: h.storyId }) },
        { y: 0, text: 'Keep it here', color: '#7fd1a8', onSelect: () => void respondHandoff(h, true) },
        { y: 0, text: 'Not now', onSelect: () => void respondHandoff(h, false) },
      ];
    }),
    { y: 0, text: 'Close', onSelect: onClose },
  ];
  const step = 0.04;
  const top = ((rows.length - 1) * step) / 2;
  return (
    <group position={[0, 0.13, 0.02]}>
      <group ref={face}>
        <mesh position={[0, 0, -0.002]} userData={{ noPoint: true }}>
          <planeGeometry args={[0.27, rows.length * step + 0.05]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} toneMapped={false} />
        </mesh>
        <Text font={fontUrl} fontSize={0.016} anchorX="center" anchorY="bottom" position={[0, top + 0.025, 0.002]} color="#24223a" material-toneMapped={false}>
          Whose eyes?
        </Text>
        {rows.map((r, i) => <Row key={`${i}-${r.text}`} {...r} y={top - i * step} />)}
      </group>
    </group>
  );
}

/** Hands have no buttons: a small light on the left wrist opens the menu with a pinch. */
function WristLight({ onSelect }: { onSelect: () => void }) {
  const color = useSocial((s) => s.perspectives.find((p) => p.key === s.viewing)?.color ?? '#ffffff');
  return (
    <mesh position={[0, 0.03, 0.02]} onClick={(e) => { e.stopPropagation(); onSelect(); }} userData={{ noPoint: true }}>
      <sphereGeometry args={[0.014, 16, 12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

export function OriginRig() {
  const anchor = useRef<THREE.Group>(null);
  const presenting = useXR((s) => s.session != null);
  const leftC = useXRInputSourceState('controller', 'left');
  const rightC = useXRInputSourceState('controller', 'right');
  const leftH = useXRInputSourceState('hand', 'left');
  const rightH = useXRInputSourceState('hand', 'right');
  const [menu, setMenuState] = useState(false);
  const setMenu = (f: (v: boolean) => boolean) => setMenuState((v) => { const n = f(v); wristMenu.open = n; return n; });
  const leftSpace = leftC?.inputSource.gripSpace ?? leftH?.inputSource.hand.get('wrist');
  const rightSpace = rightC?.inputSource.gripSpace ?? rightH?.inputSource.hand.get('wrist');
  useEffect(() => { if (!leftSpace) handAnchors.left = null; if (!rightSpace) handAnchors.right = null; }, [leftSpace, rightSpace]);
  return (
    <>
      <group ref={anchor} />
      <Scaler anchor={anchor} />
      {presenting && <Buttons setMenu={setMenu} />}
      {presenting && <Label anchor={anchor} />}
      {leftSpace && (
        <XRSpace space={leftSpace}>
          <object3D ref={(o) => { handAnchors.left = o; }} />
          {!leftC && !menu && <WristLight onSelect={() => setMenu(() => true)} />}
          {menu && <MenuPanel onClose={() => setMenu(() => false)} />}
        </XRSpace>
      )}
      {rightSpace && (
        <XRSpace space={rightSpace}>
          <object3D ref={(o) => { handAnchors.right = o; }} />
        </XRSpace>
      )}
    </>
  );
}
