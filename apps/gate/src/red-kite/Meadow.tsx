import { useFrame, useThree } from '@react-three/fiber';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { fileUrl } from '../backend/client';

export type MeadowSource = { url: string | null; liteUrl: string | null; floorY: number | null; scale: number };
export function Meadow({ source, lite, onReady, onError }: { source: MeadowSource; lite: boolean; onReady: () => void; onError: (message: string) => void }) {
  const gl = useThree(s => s.gl), scene = useThree(s => s.scene);
  const mesh = useRef<SplatMesh | null>(null);
  const loaded = useRef(false);
  const url = fileUrl(lite && source.liteUrl ? source.liteUrl : source.url);
  useEffect(() => {
    if (!url) return;
    let live = true;
    loaded.current = false;
    // Spark's default kernel coverage; the narrower photo-tuned kernel left gaps in sparse worlds.
    const spark = new SparkRenderer({ renderer: gl, maxStdDev: Math.sqrt(8), lodCleanupTimeoutMs: Infinity } as ConstructorParameters<typeof SparkRenderer>[0]);
    const material = (spark as unknown as { material?: THREE.Material }).material;
    if (material) material.forceSinglePass = true;
    scene.add(spark);
    const m = new SplatMesh({ url, raycastable: false });
    m.quaternion.set(1, 0, 0, 0);
    m.scale.setScalar(source.scale);
    m.position.y = source.floorY === null ? 1.5246 : -source.floorY * source.scale;
    m.opacity = 0;
    scene.add(m); mesh.current = m;
    m.initialized.then(() => { if (live) { loaded.current = true; onReady(); } }).catch((e: unknown) => { if (live) onError(`The meadow could not load. ${String(e).slice(0, 100)}`); });
    return () => { live = false; loaded.current = false; mesh.current = null; scene.remove(m); m.dispose(); scene.remove(spark); spark.dispose(); };
  }, [url, source.floorY, source.scale, gl, scene, onReady, onError]);
  useFrame((_, dt) => {
    if (mesh.current && loaded.current) mesh.current.opacity = THREE.MathUtils.damp(mesh.current.opacity, 1, 2.5, Math.min(dt, .05));
  });
  return null;
}
