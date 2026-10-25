// The place around the things: for rooms, a soft floor and porcelain walls that dissolve into the white above head
// height (no ceiling; it's a memory, not a box), light falling through any window; for outdoors, ground that fades
// at its edges, water that breathes with the light, and distant hills lost in the haze. Everything forms first and
// quietly, so the remembered things have somewhere to land.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ROOM, type Floor, type ScenePlan } from '../../../../../packages/shared/src/scene';
import { MEMORY_CENTER } from '../layout';
import { atmoLive } from './atmosphere';
import { GrassField } from './GrassField';
import { tint } from './style';

const FLOOR_BASE: Record<Floor, string> = {
  wood: '#c9a982', tile: '#dfe2e6', carpet: '#cbb9a8', grass: '#9fb98f', sand: '#e7d9bd', stone: '#c8c5bf', snow: '#f4f6fa', water: '#a9c9d8',
};

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Light, low-contrast surface patterns: a memory of planks or tiles, not a photograph of them. */
function floorTexture(kind: Floor, base: THREE.Color): THREE.CanvasTexture {
  seed = 7;
  const hex = `#${base.getHexString()}`;
  const dark = `#${base.clone().multiplyScalar(0.86).getHexString()}`;
  return canvasTexture(1024, (g, s) => {
    g.fillStyle = hex; g.fillRect(0, 0, s, s);
    if (kind === 'wood') {
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const y = (r * s) / rows;
        let x = -rnd() * s * 0.5;
        while (x < s) {
          const w = s * (0.35 + rnd() * 0.4);
          const shade = base.clone().multiplyScalar(0.93 + rnd() * 0.12);
          g.fillStyle = `#${shade.getHexString()}`; g.fillRect(x + 2, y + 2, w - 4, s / rows - 4);
          for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(90,60,30,${0.025 + rnd() * 0.03})`; g.lineWidth = 1; g.beginPath(); const yy = y + 6 + rnd() * (s / rows - 12); g.moveTo(x, yy); g.bezierCurveTo(x + w * 0.3, yy + rnd() * 4 - 2, x + w * 0.6, yy + rnd() * 4 - 2, x + w, yy); g.stroke(); }
          g.strokeStyle = dark; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, s / rows - 2);
          x += w;
        }
      }
    } else if (kind === 'tile' || kind === 'stone') {
      const n = kind === 'tile' ? 8 : 5;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const shade = base.clone().multiplyScalar(0.95 + rnd() * 0.08);
        g.fillStyle = `#${shade.getHexString()}`;
        const off = kind === 'stone' && j % 2 ? s / n / 2 : 0;
        g.fillRect((i * s) / n + 3 + off, (j * s) / n + 3, s / n - 6, s / n - 6);
      }
    } else {
      // carpet, grass, sand, snow: a soft speckled field
      for (let k = 0; k < 9000; k++) {
        const v = 0.9 + rnd() * 0.2;
        g.fillStyle = `#${base.clone().multiplyScalar(v).getHexString()}`;
        const r = kind === 'grass' ? 1 + rnd() * 2.2 : 0.8 + rnd() * 1.4;
        g.beginPath(); g.arc(rnd() * s, rnd() * s, r, 0, Math.PI * 2); g.fill();
      }
    }
  }, kind === 'wood' ? 3.6 : kind === 'tile' ? 2.4 : 2);
}

/** Opaque in the middle, dissolving at the edges (a rounded rectangle or a disc). */
function edgeAlpha(shape: 'rect' | 'disc'): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    if (shape === 'disc') {
      const grad = g.createRadialGradient(s / 2, s / 2, s * 0.22, s / 2, s / 2, s / 2);
      grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#000');
      g.fillStyle = grad; g.fillRect(0, 0, s, s);
    } else {
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
      g.filter = 'blur(18px)';
      g.fillStyle = '#fff';
      g.beginPath(); g.roundRect(s * 0.1, s * 0.1, s * 0.8, s * 0.86, s * 0.08); g.fill();
    }
  });
}

/** Walls fade out above head height and toward the viewer. */
function wallAlpha(side: boolean): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    const v = g.createLinearGradient(0, 0, 0, s);
    v.addColorStop(0, '#000'); v.addColorStop(0.42, '#888'); v.addColorStop(0.8, '#fff'); v.addColorStop(1, '#fff');
    g.fillStyle = v; g.fillRect(0, 0, s, s);
    if (side) {
      g.globalCompositeOperation = 'multiply';
      const h = g.createLinearGradient(0, 0, s, 0);
      h.addColorStop(0, '#fff'); h.addColorStop(0.55, '#fff'); h.addColorStop(1, '#000');
      g.fillStyle = h; g.fillRect(0, 0, s, s);
    }
  });
}

function useFade(target: number, rate = 0.8) {
  const v = useRef({ value: 0 });
  useFrame((_, dt) => { v.current.value += (target - v.current.value) * (1 - Math.exp(-Math.min(dt, 0.05) * rate)); });
  return v.current;
}

function Room({ plan }: { plan: ScenePlan }) {
  const s = plan.setting;
  const wallTint = tint('#efe7dc', 0.32).lerp(tint(s.palette[0] ?? '#efe7dc', 0.32), 0.18).multiplyScalar(0.97);
  const floorColor = tint(FLOOR_BASE[s.floor], s.floor === 'carpet' && s.palette[1] ? 0.4 : 0.82).multiplyScalar(0.94);
  const mats = useMemo(() => {
    const floor = new THREE.MeshStandardMaterial({ map: floorTexture(s.floor, floorColor), alphaMap: edgeAlpha('rect'), transparent: true, roughness: 0.82, depthWrite: true, opacity: 0 });
    const back = new THREE.MeshStandardMaterial({ color: wallTint, alphaMap: wallAlpha(false), transparent: true, roughness: 0.9, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const side = new THREE.MeshStandardMaterial({ color: wallTint, alphaMap: wallAlpha(true), transparent: true, roughness: 0.9, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const trim = new THREE.MeshStandardMaterial({ color: wallTint.clone().multiplyScalar(0.95), roughness: 0.6, transparent: true, opacity: 0 });
    return { floor, back, side, trim };
  }, [s.floor, s.palette.join(','), floorColor.getHex(), wallTint.getHex()]);
  useEffect(() => () => { for (const m of Object.values(mats)) { m.map?.dispose(); m.alphaMap?.dispose(); m.dispose(); } }, [mats]);
  const fade = useFade(1, 0.9);
  useFrame(() => {
    mats.floor.opacity = fade.value;
    mats.back.opacity = fade.value * 0.92;
    mats.side.opacity = fade.value * 0.75;
    mats.trim.opacity = fade.value;
  });
  const W = ROOM.width + 0.6, D = ROOM.depth + 0.6, H = 2.9;
  const backZ = MEMORY_CENTER.z - ROOM.depth / 2;
  const windows = plan.objects.filter((o) => o.kind === 'window');
  return (
    <group>
      <mesh material={mats.floor} rotation-x={-Math.PI / 2} position={[MEMORY_CENTER.x, 0.001, MEMORY_CENTER.z + 0.2]} renderOrder={-2} receiveShadow>
        <planeGeometry args={[W, D + 0.4]} />
      </mesh>
      <mesh material={mats.back} position={[MEMORY_CENTER.x, H / 2, backZ - 0.02]} renderOrder={-1} receiveShadow>
        <planeGeometry args={[W, H]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} material={mats.side} position={[MEMORY_CENTER.x + side * (W / 2), H / 2, backZ + D * 0.36]} rotation-y={side * -Math.PI / 2} renderOrder={-1}>
          <planeGeometry args={[D * 0.72, H]} />
        </mesh>
      ))}
      <mesh material={mats.trim} position={[MEMORY_CENTER.x, 0.05, backZ + 0.01]}>
        <boxGeometry args={[W * 0.9, 0.1, 0.02]} />
      </mesh>
      {windows.length > 0 && <LightShafts count={windows.length} warm={plan.setting.timeOfDay !== 'night'} />}
    </group>
  );
}

/** Soft beams of light falling through the window(s) onto the floor. */
function LightShafts({ count, warm }: { count: number; warm: boolean }) {
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uFade: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(warm ? '#ffe2b0' : '#c9d4ff') } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uFade, uTime; uniform vec3 uColor;
        void main() {
          float across = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          float along = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float flicker = 0.85 + 0.15 * sin(uTime * 0.6 + vUv.x * 6.0);
          float a = across * along * flicker * 0.16 * uFade;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    return m;
  }, [warm]);
  const fade = useFade(1, 0.5);
  useFrame((_, dt) => { mat.uniforms.uFade!.value = fade.value; mat.uniforms.uTime!.value += dt; });
  const backZ = MEMORY_CENTER.z - ROOM.depth / 2;
  return (
    <group>
      {Array.from({ length: Math.min(2, count) }, (_, i) => {
        const x = count === 1 ? 0 : (i === 0 ? -1 : 1) * 1.1;
        return (
          <mesh key={i} material={mat} position={[MEMORY_CENTER.x + x + 0.35, 1.05, backZ + 1.05]} rotation={[-0.95, 0.12, 0]} renderOrder={30}>
            <planeGeometry args={[1.4, 2.8]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Water({ palette }: { palette: string[] }) {
  const mat = useMemo(() => {
    // Water keeps its own colour (a remembered blue if there was one), never borrowed from a red boat.
    const blue = palette.find((c) => { const h = new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }); return h.h > 0.45 && h.h < 0.7 && h.s > 0.15; });
    const base = tint(blue ?? '#5f9bb5', 0.78);
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uBase: { value: base }, uSky: { value: new THREE.Color('#f6f4ff') } },
      vertexShader: /* glsl */ `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vW; varying vec2 vUv; uniform float uTime, uFade; uniform vec3 uBase, uSky;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main() {
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(V.y, 0.0), 3.0);
          float r = n(vW.xz * 1.6 + vec2(uTime * 0.12, uTime * 0.05)) * 0.6 + n(vW.xz * 4.0 - vec2(uTime * 0.2, 0.0)) * 0.4;
          vec3 deep = uBase * 0.78;
          vec3 col = mix(deep, mix(uBase, uSky, 0.55), fres * 0.75 + r * 0.12);
          // long soft ripple lines and sun glints, so it reads as water from any distance
          float lines = smoothstep(0.82, 1.0, sin(vW.z * 7.0 + n(vW.xz * 0.8) * 4.0 + uTime * 0.5) * 0.5 + 0.5) * 0.08;
          col += vec3(lines);
          float glint = smoothstep(0.9, 1.0, n(vW.xz * 9.0 + uTime * 0.3)) * 0.55;
          col += vec3(glint);
          float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          gl_FragColor = vec4(col, edge * uFade * 0.95);
          #include <colorspace_fragment>
        }`,
    });
  }, [palette.join(',')]);
  const fade = useFade(1, 0.6);
  useFrame((_, dt) => { mat.uniforms.uTime!.value += dt; mat.uniforms.uFade!.value = fade.value; });
  return (
    <mesh material={mat} rotation-x={-Math.PI / 2} position={[MEMORY_CENTER.x, 0.006, MEMORY_CENTER.z - 9.6]} renderOrder={-1}>
      <planeGeometry args={[38, 18]} />
    </mesh>
  );
}

function Hills({ tone }: { tone: string }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: tint(tone, 0.35), roughness: 1, transparent: true, opacity: 0 }), [tone]);
  const fade = useFade(1, 0.4);
  useFrame(() => { mat.opacity = fade.value * 0.55; mat.color.lerp(atmoLive.horizon, 0.002); });
  const hills: [number, number, number, number][] = [[-14, -24, 9, 2.6], [-3, -30, 12, 3.4], [10, -26, 10, 2.8], [20, -22, 7, 2.0]];
  return (
    <group>
      {hills.map(([x, z, r, h], i) => (
        <mesh key={i} material={mat} position={[x, -0.2, MEMORY_CENTER.z + z]} scale={[r, h, r * 0.6]} renderOrder={-3}>
          <sphereGeometry args={[1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}
    </group>
  );
}

function Outdoor({ plan }: { plan: ScenePlan }) {
  const s = plan.setting;
  const ground = tint(FLOOR_BASE[s.floor], 0.7);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: floorTexture(s.floor, ground), alphaMap: edgeAlpha('disc'), transparent: true, roughness: 0.95, opacity: 0 }), [s.floor, ground.getHex()]);
  useEffect(() => () => { mat.map?.dispose(); mat.alphaMap?.dispose(); mat.dispose(); }, [mat]);
  const fade = useFade(1, 0.9);
  useFrame(() => { mat.opacity = fade.value; });
  return (
    <group>
      {/* By water the ground is the near shore; the lake or sea opens behind it. */}
      <mesh material={mat} rotation-x={-Math.PI / 2} position={[MEMORY_CENTER.x, 0.001, MEMORY_CENTER.z + (s.water ? 3.2 : 0)]} renderOrder={-2} receiveShadow>
        <circleGeometry args={[s.water ? ROOM.outdoorRadius + 0.6 : ROOM.outdoorRadius + 2.6, 96]} />
      </mesh>
      {s.floor === 'grass' && <GrassField center={[MEMORY_CENTER.x, MEMORY_CENTER.z + (s.water ? 3.2 : 0)]} radius={s.water ? ROOM.outdoorRadius + 0.2 : ROOM.outdoorRadius + 1.8} tone={ground} grow={fade} tall={/meadow|field|farm|hill|prairie|wild|countryside/.test(s.type)} />}
      {s.water && <Water palette={s.palette} />}
      <Hills tone={s.floor === 'snow' ? '#dfe6f2' : s.floor === 'sand' ? '#c9d9de' : '#b7c9b4'} />
    </group>
  );
}

export function Setting({ plan }: { plan: ScenePlan }) {
  return plan.setting.indoor ? <Room plan={plan} /> : <Outdoor plan={plan} />;
}
