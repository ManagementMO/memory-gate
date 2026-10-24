// A soft shadow on the floor under something that hovers (the companions, floating cards). Its parent may bob;
// the shadow stays on the floor (y = 0 in world space) and softens as its caster rises.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { damp } from './util';

let shared: THREE.CanvasTexture | null = null;
function softDisc(): THREE.CanvasTexture {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  shared = new THREE.CanvasTexture(c);
  shared.colorSpace = THREE.SRGBColorSpace;
  return shared;
}

const _w = new THREE.Vector3();

export function ContactShadow({ visible, size = 0.55, color = '#57527a', strength = 0.32 }: { visible: boolean; size?: number; color?: string; strength?: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color, map: softDisc(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), [color]);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m?.parent) return;
    m.parent.getWorldPosition(_w);
    const height = Math.max(0.05, _w.y);
    // Undo the parent's height so the shadow sits on the floor, and grow/soften with height.
    m.position.set(0, -height / (m.parent.scale.y || 1) + 0.004, 0);
    const spread = 0.7 + height * 0.35;
    m.scale.set(spread, spread, spread);
    material.opacity = damp(material.opacity, visible ? strength / (0.7 + height * 0.5) : 0, 2.5, Math.min(dt, 0.05));
    m.visible = material.opacity > 0.005;
  });
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} material={material} renderOrder={5}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
