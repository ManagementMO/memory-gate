// A shared photo, in 3D: when the session's photo has a splat (SHARP on the GPU worker, or a World Labs world),
// the memory becomes a living photograph seen from where the photo was taken. Sketch things said later still form
// inside it. Only a splat made from this photo is ever shown (the bundled sample only for the sample photo).
import { useQuery } from 'convex/react';
import { useFrame, useThree } from '@react-three/fiber';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { api } from '../../../../convex/_generated/api';
import { fileUrl } from '../backend/client';
import { useGate } from '../state/store';
import { damp } from './util';

/** The eye height of a splat's camera above its floor (metres). */
export const splatEye = (floorY: number | null, scale: number) => (floorY !== null ? -floorY * scale : 1.2);

export function PhotoWorld() {
  const session = useGate((s) => s.session);
  const media = useGate((s) => s.media);
  const view = useQuery(api.rooms.get, session ? { code: session.code, token: session.token } : 'skip');
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const splat = view?.splat;
  // Real generations from this photo always; the bundled sample splat only when the sample photo was shared.
  const isSample = !!media && /sample-photo-1938/.test(media.name);
  const usable = !!splat && splat.status === 'ready' && !!splat.url && (splat.source === 'sharp' || splat.source === 'worldlabs' || (splat.source === 'prebaked' && isSample));
  const url = usable ? fileUrl(splat!.liteUrl && /OculusBrowser|Quest/i.test(navigator.userAgent) ? splat!.liteUrl : splat!.url) : null;

  const spark = useMemo(() => {
    const s = new SparkRenderer({ renderer: gl, maxStdDev: Math.sqrt(5), lodCleanupTimeoutMs: Infinity } as ConstructorParameters<typeof SparkRenderer>[0]);
    const mat = (s as unknown as { material?: THREE.Material }).material;
    if (mat) mat.forceSinglePass = true;
    return s;
  }, [gl]);
  useEffect(() => { scene.add(spark); return () => { scene.remove(spark); }; }, [scene, spark]);

  const mesh = useRef<SplatMesh | null>(null);
  const ready = useRef(false);
  useEffect(() => {
    if (!url || !splat) return;
    ready.current = false;
    const m = new SplatMesh({ url, raycastable: false } as ConstructorParameters<typeof SplatMesh>[0]);
    m.quaternion.set(1, 0, 0, 0); // OpenCV (x right, y down, z forward) → three.js
    m.scale.setScalar(splat.scale);
    m.position.set(0, splatEye(splat.floorY, splat.scale), 0);
    m.opacity = 0;
    scene.add(m);
    mesh.current = m;
    let live = true;
    m.initialized.then(() => { if (live) { ready.current = true; useGate.getState().set({ photoWorld: { eye: splatEye(splat.floorY, splat.scale) } }); } }).catch(() => undefined);
    return () => { live = false; scene.remove(m); m.dispose(); mesh.current = null; useGate.getState().set({ photoWorld: null }); };
  }, [url, splat?.id, scene]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const st = useGate.getState().stage;
    const show = ready.current && (st === 'forming' || st === 'memory' || st === 'leaving');
    m.opacity = damp(m.opacity, show ? 1 : 0, show ? 0.7 : 3, Math.min(dt, 0.05));
    m.visible = m.opacity > 0.01;
  });
  return null;
}
