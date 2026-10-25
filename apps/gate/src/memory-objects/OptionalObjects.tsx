import { Text, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { MEMORY_SLOTS } from '../../../../packages/shared/src/memoryObjects';
import { sourceMediaUrl, type MemoryCandidate, type ModelId } from './types';

class ModelBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Text font={fontUrl} fontSize={.06} maxWidth={.7} textAlign="center" position-y={.35} color="#f4e8ce">{this.props.label + '\nModel unavailable; source kept.'}</Text> : this.props.children; }
}

export function OptionalObjects({ objects, perspective, memoryKey = 'red-kite', previewId, paused, onSelect }: {
  objects: MemoryCandidate[]; perspective: string; memoryKey?: string; previewId: ModelId | null; paused: boolean; onSelect: (id: ModelId) => void;
}) {
  const scene = useThree(s => s.scene), camera = useThree(s => s.camera);
  useEffect(() => {
    const diagnostic = { snapshot: () => {
      const out: { id: string; preview: boolean; loaded: boolean; screen: number[]; position: number[] }[] = [];
      scene.traverse(node => { if (!node.name.startsWith('MemoryObject:')) return;
        const point = node.getWorldPosition(new THREE.Vector3()); point.y += (node.userData.size as number) * .35;
        out.push({ id: node.userData.id, preview: node.userData.preview, loaded: !!node.getObjectByName('MemoryObjectAsset'), position: node.getWorldPosition(new THREE.Vector3()).toArray(), screen: point.project(camera).toArray() }); });
      return out;
    } };
    const target = window as unknown as { __memoryObjectScene?: typeof diagnostic }; target.__memoryObjectScene = diagnostic;
    return () => { if (target.__memoryObjectScene === diagnostic) delete target.__memoryObjectScene; };
  }, [scene, camera]);
  return <group name="OptionalMemoryObjects">{objects.filter(o => (o.memoryKey ?? 'red-kite') === memoryKey && (o.perspective === perspective || o.perspective === 'shared') && (o.status === 'placed' || o._id === previewId)).map(object => {
    const preview = object.status !== 'placed', position = MEMORY_SLOTS[object.slot ?? 0] ?? MEMORY_SLOTS[0];
    return <group key={object._id} name={'MemoryObject:' + object._id} position={[...position]} rotation-y={object.yaw} userData={{ id: object._id, preview, size: object.size }} onClick={e => { if (paused) return; e.stopPropagation(); onSelect(object._id); }}>
      <ModelBoundary key={object.url} label={object.label}><Suspense fallback={<Text font={fontUrl} fontSize={.06} position-y={.4} color="#f4e8ce">Opening object…</Text>}><ObjectAsset object={object} preview={preview} /></Suspense></ModelBoundary>
      <Text font={fontUrl} fontSize={.045} maxWidth={1.2} textAlign="center" position={[0, object.size + .12, 0]} color={preview ? '#efc17e' : '#f2ead7'} outlineWidth={.001} outlineColor="#293b2c">{object.label + (preview ? ' · private preview' : ' · source ↗')}</Text>
      <mesh position-y={object.size * .35}><boxGeometry args={[object.size, Math.max(.25, object.size * .7), object.size * .75]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    </group>;
  })}</group>;
}

function ObjectAsset({ object, preview }: { object: MemoryCandidate; preview: boolean }) {
  const url = sourceMediaUrl(object.url); if (!url) throw new Error('No model URL.');
  const { scene } = useGLTF(url);
  const { clone, scale, offset } = useMemo(() => {
    const clone = scene.clone(true); let triangles = 0;
    clone.traverse(node => { if (!(node instanceof THREE.Mesh)) return;
      triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position')?.count ?? 0) / 3;
    });
    if (triangles > 20_000) throw new Error('This model exceeds the optional prop budget.');
    const box = new THREE.Box3().setFromObject(clone), extent = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const largest = Math.max(extent.x, extent.y, extent.z);
    if (!Number.isFinite(largest) || largest < .00001) throw new Error('Model dimensions are unavailable.');
    clone.traverse(node => { if (!(node instanceof THREE.Mesh)) return;
      const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(original => {
        const m = original.clone(); m.transparent = preview; m.opacity = preview ? .65 : 1; m.depthWrite = !preview;
        if (object.modelSource === 'tripo' && 'color' in m) (m as THREE.MeshStandardMaterial).color.set('#c9b696');
        return m;
      }); node.material = Array.isArray(node.material) ? materials : materials[0]!;
    });
    return { clone, scale: object.size / largest, offset: [-centre.x, -box.min.y, -centre.z] as [number, number, number] };
  }, [scene, object.size, object.modelSource, preview]);
  useEffect(() => () => clone.traverse(node => { if (node instanceof THREE.Mesh) for (const m of Array.isArray(node.material) ? node.material : [node.material]) m.dispose(); }), [clone]);
  return <group name="MemoryObjectAsset" scale={scale}><group position={offset}><primitive object={clone} /></group></group>;
}
