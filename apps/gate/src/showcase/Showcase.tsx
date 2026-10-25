// A memory of a place we already have, finished (a garden, a football field, a classroom, a living room): no planning,
// the whole place forms around you. It wears its own sky, sun and fog while it's here, and stands so that its
// eye-level view is where you are (the origin, facing −z). In a headset it grows a fraction of its grass.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ScenePlan } from '../../../../packages/shared/src/scene';
import { buildShowcase, type BuiltShowcase } from './build';
import { useMemory } from '../flow/memory';
import { heldHeard } from './held';

const specs = import.meta.glob('./scenes/*.json', { eager: true, import: 'default' }) as Record<string, ShowcaseSpec>;
const scripts = import.meta.glob('./scenes/*.js') as Record<string, () => Promise<{ default?: (api: unknown) => Promise<void> }>>;
const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
type ShowcaseSpec = { title?: string; cameras?: { name?: string; pos: [number, number, number]; target: [number, number, number] }[] };

/** Which showcase a memory is, from what it's called and what's in it (null: plan and draw it as usual). */
export function showcaseFor(plan: ScenePlan | null): string | null {
  if (!plan) return null;
  const forced = new URLSearchParams(location.search).get('showcase');
  if (forced) return specs[`./scenes/${forced}.json`] ? forced : null;
  const kind = `${plan.setting.type} ${plan.title}`.toLowerCase();
  const all = `${kind} ${plan.objects.map((o) => `${o.label} ${o.quote ?? ''}`).join(' ')}`.toLowerCase();
  const outdoor = !plan.setting.indoor;
  if (/football|stadium|gridiron|playing field|bleachers|end zone/.test(all)) return 'football-field';
  if (/classroom|school ?room|schoolhouse|\bschool\b/.test(kind)) return 'classroom';
  if (/alamo|painted lad/.test(all)) return 'sf-alamo-square';
  if (outdoor && /\bstreet\b/.test(kind) && /san francisco|cable car|victorian/.test(all)) return 'sf-street';
  if (outdoor && /garden|back ?yard|\byard\b|lawn|orchard/.test(kind)) return 'garden';
  if (!outdoor && /bedroom/.test(kind) && /china|chinese|shanghai|beijing|1950/.test(all)) return 'bedroom-1950s-china';
  if (!outdoor && /living room|parlou?r|sitting room|lounge|front room/.test(kind)) return 'room-kit';
  if (outdoor && /\b(house|home|porch|front yard)\b/.test(kind)) return 'house';
  return null;
}

function dispose(b: BuiltShowcase) {
  b.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    for (const mat of [m.material].flat()) mat?.dispose();
  });
  b.envMap?.dispose();
  b.hdr?.dispose();
}

export function Showcase({ name, camera: view = 0 }: { name: string; camera?: number }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const spec = specs[`./scenes/${name}.json`];
  const [built, setBuilt] = useState<BuiltShowcase | null>(null);
  useEffect(() => {
    if (!spec) return;
    let live = true;
    let made: BuiltShowcase | null = null;
    void (async () => {
      const load = scripts[`./scenes/${name}.js`];
      const script = load ? (await load().catch(() => null))?.default : undefined;
      const b = await buildShowcase({ spec, script, renderer: gl, camera, grass: QUEST ? 0.1 : 0.5 });
      if (!live) { dispose(b); return; }
      made = b;
      setBuilt(b);
      useMemory.setState({ showcaseReady: true });
    })();
    return () => { live = false; if (made) dispose(made); setBuilt(null); useMemory.setState({ showcaseReady: false }); };
  }, [name]);
  // Its sky, light and fog while it's here; the white space's own come back after.
  useEffect(() => {
    if (!built) return;
    const prev = { bg: scene.background, env: scene.environment, fog: scene.fog, exp: gl.toneMappingExposure, envI: scene.environmentIntensity, bgI: scene.backgroundIntensity, blur: scene.backgroundBlurriness, rot: scene.environmentRotation.y, far: (camera as THREE.PerspectiveCamera).far };
    // a showcase is a whole landscape (the Golden Gate is two kilometres off): the camera sees as far as it does (in a
    // headset too: the XR session takes its depth range from this camera)
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) { cam.far = 4000; cam.updateProjectionMatrix(); }
    scene.background = built.background;
    scene.environment = built.envMap;
    scene.fog = built.fog;
    scene.environmentIntensity = built.envIntensity;
    scene.backgroundIntensity = built.backgroundIntensity;
    scene.backgroundBlurriness = built.backgroundBlur;
    scene.environmentRotation.y = scene.backgroundRotation.y = built.rotation + turn;
    gl.toneMappingExposure = built.exposure;
    return () => {
      scene.background = prev.bg; scene.environment = prev.env; scene.fog = prev.fog;
      scene.environmentIntensity = prev.envI; scene.backgroundIntensity = prev.bgI; scene.backgroundBlurriness = prev.blur;
      scene.environmentRotation.y = scene.backgroundRotation.y = prev.rot;
      gl.toneMappingExposure = prev.exp;
      if (cam.isPerspectiveCamera) { cam.far = prev.far; cam.updateProjectionMatrix(); }
    };
  }, [built]);
  // Held things someone has named rise into their places.
  const revealed = useMemory((s) => s.revealed);
  const placed = useRef(new Set<number>());
  const rising = useRef<{ node: THREE.Object3D; base: number; t: number }[]>([]);
  useEffect(() => {
    if (!built) return;
    for (const i of revealed ?? []) {
      if (placed.current.has(i)) continue;
      const h = built.held.find((x) => x.index === i);
      if (!h) continue;
      placed.current.add(i);
      void built.place(h.it).then((node) => { if (node) { rising.current.push({ node, base: node.scale.x, t: 0 }); node.scale.setScalar(node.scale.x * 0.01); } });
    }
  }, [built, revealed]);
  useEffect(() => { placed.current = new Set(); rising.current = []; useMemory.setState({ revealed: [] }); }, [name]);
  // For rehearsals and checks: say something to the place without a microphone (window.__showcaseSay('a birdbath')).
  useEffect(() => {
    const w = window as unknown as { __showcaseSay?: (text: string) => number[] };
    w.__showcaseSay = (text) => { const st = useMemory.getState(); const ids = heldHeard(name, text, st.revealed ?? []); if (ids.length) useMemory.setState({ revealed: [...(st.revealed ?? []), ...ids] }); return ids; };
    return () => { delete w.__showcaseSay; };
  }, [name]);
  useFrame((_, dt) => {
    if (built) for (const u of built.uniforms) u.value += Math.min(dt, 0.1);
    for (const r of rising.current) {
      if (r.t >= 1.4) continue;
      r.t += Math.min(dt, 0.05);
      const k = Math.min(1, r.t / 1.4);
      r.node.scale.setScalar(r.base * (0.01 + 0.99 * (1 - (1 - k) ** 3)));
    }
  });
  // Stand it so its eye-level camera is where you are (on its ground, however high), looking the way it looks.
  const eye = spec?.cameras?.[view] ?? spec?.cameras?.[0];
  const [dx, dz] = eye ? [eye.target[0] - eye.pos[0], eye.target[2] - eye.pos[2]] : [0, -1];
  const turn = useMemo(() => Math.PI - Math.atan2(dx, dz), [dx, dz]);
  if (!built || !eye) return null;
  return (
    <group rotation-y={turn} name="showcase">
      <group position={[-eye.pos[0], -(eye.pos[1] - 1.6), -eye.pos[2]]}>
        <primitive object={built.group} />
      </group>
    </group>
  );
}
