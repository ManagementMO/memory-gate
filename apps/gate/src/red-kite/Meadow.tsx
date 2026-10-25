import { useFrame, useThree } from '@react-three/fiber';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fileUrl } from '../backend/client';

export type MeadowSource = { url: string | null; liteUrl: string | null; floorY: number | null; scale: number };
export function Meadow({ source, lite, detailed = false, verticalShift = 0, onReady, onError }: { source: MeadowSource; lite: boolean; detailed?: boolean; verticalShift?: number; onReady: (ready: boolean) => void; onError: (message: string) => void }) {
  const gl = useThree(s => s.gl), scene = useThree(s => s.scene);
  const mesh = useRef<SplatMesh | null>(null);
  const renderer = useRef<SparkRenderer | null>(null);
  const coarse = useMemo(() => matchMedia('(pointer: coarse)').matches, []);
  const loaded = useRef(false);
  const url = detailed ? '/red-kite/meadow-full.spz' : fileUrl(lite && source.liteUrl ? source.liteUrl : source.url);
  useEffect(() => {
    if (!url) return;
    let live = true;
    loaded.current = false;
    onReady(false);
    // Spark's default kernel coverage; the narrower photo-tuned kernel left gaps in sparse worlds.
    const spark = new SparkRenderer({ renderer: gl, maxStdDev: Math.sqrt(8), lodCleanupTimeoutMs: Infinity } as ConstructorParameters<typeof SparkRenderer>[0]);
    const material = (spark as unknown as { material?: THREE.Material }).material;
    if (material) material.forceSinglePass = true;
    scene.add(spark); renderer.current = spark;
    // Full source detail + view-dependent LoD concentrates the render budget around the walker.
    // A globally reduced 500k export cannot restore nearby foliage detail as the viewpoint changes.
    const m = new SplatMesh({ url, raycastable: false, lod: detailed, enableLod: detailed });
    m.name = 'RedKiteMeadow';
    m.userData.instance = m.uuid;
    m.userData.detail = detailed ? 'adaptive-full' : lite ? '100k' : '500k';
    m.quaternion.set(1, 0, 0, 0);
    m.scale.setScalar(source.scale);
    m.position.y = source.floorY === null ? 1.5246 : -source.floorY * source.scale;
    m.opacity = 0;
    scene.add(m); mesh.current = m;
    m.initialized.then(() => { if (live) loaded.current = true; }).catch((e: unknown) => { if (live) onError(`The meadow could not load. ${String(e).slice(0, 100)}`); });
    return () => { live = false; loaded.current = false; mesh.current = null; renderer.current = null; scene.remove(m); m.dispose(); scene.remove(spark); spark.dispose(); };
  }, [url, detailed, lite, source.floorY, source.scale, gl, scene, onReady, onError]);
  useFrame((_, dt) => {
    if (renderer.current) renderer.current.lodSplatCount = gl.xr.isPresenting ? 500_000 : coarse ? 600_000 : 1_200_000;
    if (mesh.current) {
      mesh.current.userData.renderBudget = renderer.current?.lodSplatCount;
      mesh.current.userData.activeSplats = renderer.current?.activeSplats ?? 0;
      mesh.current.userData.opacity = mesh.current.opacity;
      mesh.current.position.y = (source.floorY === null ? 1.5246 : -source.floorY * source.scale) + verticalShift;
      if (loaded.current) mesh.current.opacity = THREE.MathUtils.damp(mesh.current.opacity, 1, 2.5, Math.min(dt, .05));
      // Parsing the SPZ precedes the worker's first visible sort/LoD result. Do not expose ready
      // controls while the world is still absent, particularly when entering an immersive session.
      if (loaded.current && !mesh.current.userData.ready && (renderer.current?.activeSplats ?? 0) > 10_000 && mesh.current.opacity > .65) {
        mesh.current.userData.ready = true; onReady(true);
      }
    }
  });
  return null;
}
