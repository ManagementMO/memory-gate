// ?preview=library — every library object on a porcelain stage, lit like the memory space (studio environment,
// soft sky, contact shadows, bloom). For review and for the morning report's screenshots.
//   &page=0|1|2      18 objects per page (default: all, small)
//   &keys=a,b,c      a chosen subset
//   &only=<key>      one object, large, slowly turning
//   &color=%23c0504d tint (passed as the remembered colour)   &label=yellow%20curtains   &scale=1
import { ContactShadows, Environment, Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LIBRARY_KEYS } from '../../../../packages/shared/src/scene';
import { LIBRARY_BUILDERS } from '../scene/sketch/library';
import { newReveal } from '../scene/sketch/style';

const params = new URLSearchParams(location.search);
const only = params.get('only');
const color = params.get('color') || null;
const label = params.get('label');
const scaleParam = Number(params.get('scale') ?? 1) || 1;
const page = params.get('page');
const keysParam = params.get('keys');
// &spec=window:%23e8c547:yellow curtains;chair:%23c0504d:red chair — per-object colour and label (for colour review)
const specParam = params.get('spec');
const SPEC = specParam ? specParam.split(';').filter(Boolean).map((t) => { const [key = '', c = '', l = ''] = t.split(':'); return { key, color: c || null, label: l || key.replace(/_/g, ' ') }; }) : null;
const reveal = newReveal();
reveal.reveal.value = 1;

function Studio() {
  const gl = useThree((s) => s.gl);
  const texture = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return rt.texture;
  }, [gl]);
  return <Environment map={texture} environmentIntensity={0.5} />;
}

type Built = { key: string; group: THREE.Group; size: THREE.Vector3; center: THREE.Vector3; tris: number; meshes: number };

function build(key: string, i: number): Built | null {
  const b = LIBRARY_BUILDERS[key];
  if (!b) return null;
  const spec = SPEC?.[i];
  const group = b({
    color: spec ? spec.color : key === only || keysParam ? color : null, material: null, scale: key === only ? scaleParam : 1, seed: 1000 + i * 7, reveal,
    label: spec ? spec.label : label ?? key.replace(/_/g, ' '),
  });
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  let tris = 0, meshes = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
  });
  return { key, group, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), tris: Math.round(tris), meshes };
}

function Gallery({ keys }: { keys: string[] }) {
  const items = useMemo(() => keys.map((k, i) => build(k, i)).filter((x): x is Built => !!x), [keys]);
  const cols = 6;
  const cellW = 2.3, cellD = 2.6;
  const rows = Math.ceil(items.length / cols);
  (window as unknown as { __library?: unknown }).__library = items.map((it) => ({ key: it.key, size: it.size.toArray().map((n) => +n.toFixed(2)), tris: it.tris, meshes: it.meshes }));
  return (
    <group>
      {items.map((it, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const x = (c - (cols - 1) / 2) * cellW, z = (r - (rows - 1) / 2) * cellD;
        const maxDim = Math.max(it.size.x, it.size.y, it.size.z);
        const k = 1.45 / maxDim;
        return (
          <group key={it.key} position={[x, 0, z]}>
            <group scale={k} position={[-it.center.x * k, 0, -it.center.z * k]}>
              <primitive object={it.group} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

function Single({ k }: { k: string }) {
  const it = useMemo(() => build(k, 0), [k]);
  const spin = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const fitted = useRef(false);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.18;
    if (it && !fitted.current) {
      fitted.current = true;
      const r = it.size.length() / 2;
      const d = (r / Math.sin(THREE.MathUtils.degToRad(35) / 2)) * 0.9;
      camera.position.set(0, it.size.y * 0.5 + d * 0.28, d);
      camera.lookAt(0, it.size.y * 0.5, 0);
    }
  });
  if (!it) return <Html center>No builder for “{k}”</Html>;
  (window as unknown as { __library?: unknown }).__library = [{ key: it.key, size: it.size.toArray(), tris: it.tris, meshes: it.meshes }];
  return (
    <group ref={spin} rotation-y={-0.5}>
      <group position={[-it.center.x, 0, -it.center.z]}><primitive object={it.group} /></group>
    </group>
  );
}

function GalleryCamera({ rows }: { rows: number }) {
  const camera = useThree((s) => s.camera);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const sway = Math.sin(t.current * 0.12) * 0.6;
    const depth = Math.max(rows, 2) * 2.6;
    camera.position.set(sway, 4.2 + depth * 0.55, 6 + depth * 1.05);
    camera.lookAt(0, 0.2, 0.4);
  });
  return null;
}

export default function LibraryPreview() {
  const all = LIBRARY_KEYS;
  const keys = SPEC ? SPEC.map((x) => x.key) : keysParam ? keysParam.split(',').filter(Boolean) : page !== null ? all.slice(Number(page) * 18, Number(page) * 18 + 18) : all;
  const rows = Math.ceil(keys.length / 6);
  const names = only ? [only] : keys;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#eef0f6' }}>
      <ol style={{ position: 'absolute', left: 16, bottom: 10, right: 16, margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '2px 14px', font: '500 12px/1.4 system-ui', color: '#6b6880', zIndex: 2 }}>
        {names.map((k, i) => <li key={`${k}-${i}`}>{only ? '' : `${i + 1}. `}{SPEC?.[i]?.label ?? k.replace(/_/g, ' ')}</li>)}
      </ol>
      <Canvas dpr={[1, 2]} camera={{ fov: 35, near: 0.02, far: 200, position: [0, 6, 14] }} gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}>
        <color attach="background" args={['#eef0f6']} />
        <Studio />
        {/* Recommended exposure for porcelain on a near-white stage: low sky fill, a clear warm key, a cool soft fill. */}
        <hemisphereLight args={['#f4f2ff', '#c9ccd9', 0.32]} />
        <directionalLight position={[-3, 6, 4]} intensity={1.55} color="#fff3e4" />
        <directionalLight position={[4, 3, -2]} intensity={0.35} color="#dfe6ff" />
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, 0]}>
          <circleGeometry args={[40, 64]} />
          <meshStandardMaterial color="#eceef4" roughness={0.92} />
        </mesh>
        <ContactShadows position={[0, 0.001, 0]} scale={only ? 8 : 34} resolution={2048} blur={only ? 3.2 : 2.4} opacity={0.42} far={only ? 3 : 5} color="#4b4766" />
        {only ? <Single k={only} /> : <><Gallery keys={keys} /><GalleryCamera rows={rows} /></>}
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.6} luminanceThreshold={1.05} luminanceSmoothing={0.12} radius={0.6} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
