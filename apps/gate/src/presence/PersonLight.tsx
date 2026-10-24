// One person in the visit, as everyone else sees them: for now a soft light of their own colour that breathes, and
// brightens for a moment when they point at something. This is the one place to swap in a generated likeness of the
// person later; anything that takes the same props (colour, when they last pointed, light or dark surroundings) fits.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { glowBlending } from '../scene/util';
import { serverNow } from './presence';

let haloTex: THREE.Texture | null = null;
function haloTexture(): THREE.Texture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

export type PersonLightProps = { color: string; pointedAt: number | null; onLight: boolean; seed: number };

export function PersonLight({ color, pointedAt, onLight, seed }: PersonLightProps) {
  const core = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const tint = useRef<THREE.Sprite>(null);
  const m = useMemo(() => {
    const c = new THREE.Color(color);
    return {
      c,
      core: new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(1.7), toneMapped: false, transparent: true, fog: false }),
      // Additive glow carries the light at night; a soft tinted halo keeps it visible on the white page by day.
      glow: glowBlending(new THREE.SpriteMaterial({ map: haloTexture(), color: c.clone().multiplyScalar(0.6), depthWrite: false, toneMapped: false, fog: false })),
      tint: new THREE.SpriteMaterial({ map: haloTexture(), color: c, transparent: true, opacity: 0.32, depthWrite: false, fog: false }),
    };
  }, [color]);
  useEffect(() => () => { m.core.dispose(); m.glow.dispose(); m.tint.dispose(); }, [m]);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const lit = pointedAt ? Math.max(0, 1 - (serverNow() - pointedAt) / 2500) : 0;
    const breathe = 1 + Math.sin(t * 1.6 + seed * 1.9) * 0.07 + lit * 0.4;
    core.current?.scale.setScalar(breathe);
    glow.current?.scale.setScalar(0.15 * breathe);
    m.glow.color.copy(m.c).multiplyScalar(0.5 + lit * 0.5);
    if (tint.current) { tint.current.visible = onLight; tint.current.scale.setScalar(0.1 * breathe); }
  });
  return (
    <group>
      <mesh ref={core} material={m.core}>
        <sphereGeometry args={[0.022, 24, 16]} />
      </mesh>
      <sprite ref={glow} material={m.glow} />
      <sprite ref={tint} material={m.tint} />
    </group>
  );
}
