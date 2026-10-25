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
import { reportDevice } from '../diag/deviceLog';

const specs = import.meta.glob('./scenes/*.json', { eager: true, import: 'default' }) as Record<string, ShowcaseSpec>;
const scripts = import.meta.glob('./scenes/*.js') as Record<string, () => Promise<{ default?: (api: unknown) => Promise<void> }>>;
const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
type ShowcaseSpec = {
  title?: string; env?: Record<string, unknown>; items?: { m?: string; say?: string[] }[]; scatter?: { m?: string }[];
  cameras?: { name?: string; pos: [number, number, number]; target: [number, number, number]; env?: Record<string, unknown> }[];
};

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

const texturesOf = (mat: THREE.Material) => Object.values(mat).filter((v): v is THREE.Texture => !!(v as THREE.Texture | null)?.isTexture);

function dispose(b: BuiltShowcase) {
  b.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    for (const mat of [m.material].flat()) {
      if (!mat) continue;
      for (const t of texturesOf(mat)) t.dispose(); // a material lets go of its program, not its pictures
      mat.dispose();
    }
    if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
  });
  b.envMap?.dispose();
  b.hdr?.dispose();
}

/** Ahead of its first frame its pictures go up to the GPU, so that frame isn't a long stall in a headset. (Not its
 *  shaders: waiting on a headset's driver to say they've compiled can wait forever, and the place never came.) */
function warm(b: BuiltShowcase, gl: THREE.WebGLRenderer) {
  const textures = new Set<THREE.Texture>();
  b.group.traverse((o) => { for (const mat of [(o as THREE.Mesh).material].flat()) if (mat) for (const t of texturesOf(mat)) textures.add(t); });
  for (const t of textures) { try { gl.initTexture(t); } catch { /* it goes up on its first frame instead */ } }
}

async function make(name: string, view: number, gl: THREE.WebGLRenderer, camera: THREE.Camera): Promise<BuiltShowcase | null> {
  const base = specs[`./scenes/${name}.json`];
  if (!base) return null;
  // a view can wear its own light: the same bridge in the late sun, at dusk, at noon
  const own = base.cameras?.[view]?.env;
  const spec = own ? { ...base, env: { ...base.env, ...own } } : base;
  // Put together after "yes", behind the white. (Its files fetched ahead at low priority while they talked made a
  // headset take them one at a time over the tunnel: the garden took 40 s, then didn't come at all.)
  const t0 = performance.now();
  reportDevice('showcase-start', { name, view });
  try {
    const load = scripts[`./scenes/${name}.js`];
    const script = load ? (await load().catch(() => null))?.default : undefined;
    const b = await buildShowcase({ spec, script, renderer: gl, camera, grass: QUEST ? 0.1 : 0.5 });
    warm(b, gl);
    reportDevice('showcase-built', { name, view, ms: Math.round(performance.now() - t0) });
    return b;
  } catch (e) {
    console.warn('[showcase]', name, e);
    return null;
  }
}


/** The ground of the place being shown under a point (world x, z), near where you stand: for the people standing in
 *  it (a beach runs down to the water). Null when there's none, or no place is shown. */
let groundUnder: ((x: number, z: number) => number | null) | null = null;
export const showcaseGround = (x: number, z: number): number | null => groundUnder?.(x, z) ?? null;

export function Showcase({ name, camera: view = 0 }: { name: string; camera?: number }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const spec = specs[`./scenes/${name}.json`];
  const [built, setBuilt] = useState<BuiltShowcase | null>(null);
  const drawnFrames = useRef(0);
  const settled = useRef(0);
  useEffect(() => {
    if (!spec) return;
    let live = true;
    let made: BuiltShowcase | null = null;
    drawnFrames.current = 0;
    settled.current = 0;
    // a build that fails is tried once more, rather than leaving only the white
    const p = make(name, view, gl, camera).then((b) => b ?? (live ? make(name, view, gl, camera) : null));
    void p.then((b) => {
      if (!b) return;
      if (!live) { dispose(b); return; }
      made = b;
      setBuilt(b);
    });
    return () => { live = false; if (made) dispose(made); setBuilt(null); useMemory.setState({ showcaseReady: false }); };
  }, [name, view]);
  // In a headset, while it's here: 72 frames a second (a whole place can't be drawn at 120) and the edges of the view
  // drawn coarser. Both put back after.
  useEffect(() => {
    if (!built) return;
    type Rates = XRSession & { frameRate?: number; supportedFrameRates?: Float32Array; updateTargetFrameRate?: (rate: number) => Promise<void> };
    let session: Rates | null = null;
    let rate = 0, foveation = 0;
    const apply = () => {
      session = gl.xr.getSession() as Rates | null;
      if (!session) return;
      rate = session.frameRate ?? 0;
      const lowest = Math.min(...(session.supportedFrameRates ?? []));
      if (Number.isFinite(lowest)) void session.updateTargetFrameRate?.(lowest).catch(() => undefined);
      foveation = gl.xr.getFoveation() ?? 0;
      gl.xr.setFoveation(1);
    };
    apply();
    gl.xr.addEventListener('sessionstart', apply);
    return () => {
      gl.xr.removeEventListener('sessionstart', apply);
      if (session && gl.xr.getSession() === session) {
        if (rate) void session.updateTargetFrameRate?.(rate).catch(() => undefined);
        gl.xr.setFoveation(foveation);
      }
    };
  }, [built]);
  // Its sun's shadows are drawn while it settles (and while something rises into it), then kept: a place holds still,
  // and drawing them every frame cost a headset a second pass over the whole place.
  const shadowLights = useMemo(() => {
    const out: THREE.DirectionalLight[] = [];
    built?.group.traverse((o) => { const l = o as THREE.DirectionalLight; if (l.isDirectionalLight && l.castShadow) { l.shadow.autoUpdate = false; l.shadow.needsUpdate = true; out.push(l); } });
    return out;
  }, [built]);
  // What it costs to draw, from a headset (diag/deviceLog), once it has settled.
  useEffect(() => {
    if (!built) return;
    const t = setTimeout(() => reportDevice('showcase', { name, view, calls: gl.info.render.calls, triangles: gl.info.render.triangles, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries }), 5000);
    return () => clearTimeout(t);
  }, [built]);
  useEffect(() => {
    if (!built) return;
    let grounds: THREE.Object3D[] | null = null;
    const ray = new THREE.Raycaster(), from = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    groundUnder = (x, z) => {
      if (!grounds) {
        // what's broad and low is ground (a lawn, a beach, a hillside); a tree, a table or a bench isn't
        const box = new THREE.Box3(), size = new THREE.Vector3();
        const found: THREE.Object3D[] = [];
        built.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
          box.setFromObject(m).getSize(size);
          const wide = Math.max(size.x, size.z);
          if (wide > 8 && size.y < wide * 0.3) found.push(m);
        });
        grounds = found;
      }
      from.set(x, 4, z);
      ray.set(from, down);
      ray.far = 8;
      return ray.intersectObjects(grounds, false)[0]?.point.y ?? null;
    };
    return () => { groundUnder = null; };
  }, [built]);
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
      void built.place(h.it).then((node) => {
        if (!node) return;
        rising.current.push({ node, base: node.scale.x, t: 0 });
        node.scale.setScalar(node.scale.x * 0.01);
        // turn them toward it as it rises (OriginRig does the turning, behind a blink)
        node.updateWorldMatrix(true, false);
        const at = node.getWorldPosition(new THREE.Vector3());
        useMemory.setState((st) => ({ face: { x: at.x, z: at.z, n: (st.face?.n ?? 0) + 1 } }));
      });
    }
  }, [built, revealed]);
  useEffect(() => { placed.current = new Set(); rising.current = []; useMemory.setState({ revealed: [], face: null }); }, [name, view]);
  // For rehearsals and checks: say something to the place without a microphone (window.__showcaseSay('a birdbath')).
  useEffect(() => {
    const w = window as unknown as { __showcaseSay?: (text: string) => number[] };
    w.__showcaseSay = (text) => { const st = useMemory.getState(); const ids = heldHeard(name, text, st.revealed ?? []); if (ids.length) useMemory.setState({ revealed: [...(st.revealed ?? []), ...ids] }); return ids; };
    return () => { delete w.__showcaseSay; };
  }, [name]);
  useFrame((_, dt) => {
    // Ready once it has actually been drawn a couple of times behind the white (its first frame is the slow one): only
    // then does the white step back and the companion say it's here.
    if (built && drawnFrames.current < 3 && ++drawnFrames.current === 3) useMemory.setState({ showcaseReady: true });
    if (built) {
      settled.current += Math.min(dt, 0.1);
      if (settled.current < (QUEST ? 2 : 8) || rising.current.some((r) => r.t < 1.4)) for (const l of shadowLights) l.shadow.needsUpdate = true;
    }
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
  // Rays pass through it (its grass and things sit under the memory's pinch handler): a held pinch reaches the ground
  // to walk, and the headset's buttons are never behind a blade of grass.
  return (
    <group rotation-y={turn} name="showcase" ref={(g) => { if (g) (g as unknown as { pointerEvents?: string }).pointerEvents = 'none'; }}>
      <group position={[-eye.pos[0], -(eye.pos[1] - 1.6), -eye.pos[2]]}>
        <primitive object={built.group} />
      </group>
    </group>
  );
}
