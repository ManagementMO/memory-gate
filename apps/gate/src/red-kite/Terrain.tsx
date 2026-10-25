import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { createTraversal, type CollisionGeometry, type MeadowTraversal } from './traversal';
import type { MeadowSource } from './Meadow';

export function Terrain({ source, debug, onReady, onError }: { source: MeadowSource; debug: RefObject<boolean>; onReady: (world: MeadowTraversal | null) => void; onError: (error: string) => void }) {
  const { scene } = useGLTF('/red-kite/meadow-collider.glb');
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const world = new THREE.Matrix4().makeRotationX(Math.PI).scale(new THREE.Vector3(source.scale, source.scale, source.scale));
    world.setPosition(0, source.floorY === null ? 1.5246 : -source.floorY * source.scale, 0);
    const meshes: THREE.BufferGeometry[] = [];
    scene.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(world)); });
    return meshes;
  }, [scene, source.scale, source.floorY]);
  useEffect(() => {
    let live = true, runtime: MeadowTraversal | undefined;
    const meshes: CollisionGeometry[] = geometry.map(g => ({ vertices: Float32Array.from(g.getAttribute('position').array), indices: g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: g.getAttribute('position').count }, (_, i) => i) }));
    createTraversal(meshes).then(w => {
      if (!live) { w.dispose(); return; }
      runtime = w; if (group.current) group.current.position.y = w.verticalShift; onReady(w);
    }).catch(e => { if (live) onError(`The walking surface could not open. ${String(e).slice(0, 140)}`); });
    return () => { live = false; if (runtime) { onReady(null); runtime.dispose(); } };
  }, [geometry, onReady, onError]);
  useEffect(() => () => { for (const g of geometry) g.dispose(); }, [geometry]);
  useFrame(() => { if (group.current) group.current.visible = debug.current; });
  return <group ref={group} name="RedKiteCollider" visible={false}>
    {geometry.map((g, i) => <mesh key={i} geometry={g} raycast={() => null}><meshBasicMaterial wireframe color="#ead39c" transparent opacity={.45} depthWrite={false} toneMapped={false} /></mesh>)}
  </group>;
}
