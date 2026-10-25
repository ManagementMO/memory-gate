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
import { environmentFarPlane } from '../../../../packages/shared/src/worldlabs';

/** The eye height of a splat's camera above its floor (metres). */
export const splatEye = (floorY: number | null, scale: number) => (floorY !== null ? -floorY * scale : 1.2);

export function PhotoWorld() {
  const session = useGate((s) => s.session);
  const media = useGate((s) => s.media);
  const view = useQuery(api.rooms.get, session ? { code: session.code, token: session.token } : 'skip');
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const splat = view?.splat;
  // Real generations from this photo always; the bundled sample splat only when the sample photo was shared.
  const isSample = !!media && /sample-photo-1938/.test(media.name);
  const usable = !!splat && splat.status === 'ready' && !!splat.url && (splat.source === 'sharp' || splat.source === 'worldlabs' || (splat.source === 'prebaked' && isSample));
  // The headset sees the same world as the browser. The 100k export of a World Labs world lost too much in stereo (the
  // Red Kite page found the same), so the lighter file is for photo splats on a headset, or when asked for (?lite=1).
  const liteAsked = new URLSearchParams(location.search).get('lite');
  const lite = !!splat?.liteUrl && (liteAsked === '1' || (liteAsked !== '0' && splat.source !== 'worldlabs' && /OculusBrowser|Quest/i.test(navigator.userAgent)));
  const url = usable ? fileUrl(lite ? splat!.liteUrl : splat!.url) : null;

  // The cached meadow has forward centers beyond 267m. Keep its horizon within the projection volume,
  // restoring the prior range when this source leaves so the portal/photo presentation stays independent.
  useEffect(() => {
    if (!usable || !splat || !(camera instanceof THREE.PerspectiveCamera)) return;
    const previous = camera.far, far = environmentFarPlane(splat.source);
    camera.far = far; camera.updateProjectionMatrix();
    return () => {
      if (camera.far === far) { camera.far = previous; camera.updateProjectionMatrix(); }
    };
  }, [usable, splat?.source, camera]);

  // A whole World Labs world is seen from several places (each perspective's viewpoint), not only where a photo was
  // taken: Spark's default kernel coverage, as the Red Kite meadow uses, since the photo-tuned one leaves gaps there.
  // (Chosen when the renderer is made: changing it on a running renderer stopped splats drawing in the headset.)
  const kernel = splat?.source === 'worldlabs' ? Math.sqrt(8) : Math.sqrt(5);
  const spark = useMemo(() => {
    const s = new SparkRenderer({ renderer: gl, maxStdDev: kernel, lodCleanupTimeoutMs: Infinity } as ConstructorParameters<typeof SparkRenderer>[0]);
    const mat = (s as unknown as { material?: THREE.Material }).material;
    if (mat) mat.forceSinglePass = true;
    return s;
  }, [gl, kernel]);
  useEffect(() => { scene.add(spark); return () => { scene.remove(spark); spark.dispose(); }; }, [scene, spark]);

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

  // A world whose full-resolution export ships with the app comes in twice: the room's copy first (it arrives in
  // seconds), then the full source with Spark's level of detail, faded in over it once loaded, so what's near the
  // visitor keeps the source's own detail (the Red Kite page does the same; a uniformly reduced copy can't).
  const fullUrl = usable && splat!.source === 'worldlabs' && splat!.worldId && liteAsked !== '1' ? FULL_SOURCE[splat!.worldId] ?? null : null;
  const detail = useRef<SplatMesh | null>(null);
  const detailReady = useRef(false);
  useEffect(() => {
    if (!fullUrl || !splat) return;
    detailReady.current = false;
    const m = new SplatMesh({ url: fullUrl, raycastable: false, lod: true, enableLod: true });
    m.quaternion.set(1, 0, 0, 0);
    m.scale.setScalar(splat.scale);
    m.position.set(0, splatEye(splat.floorY, splat.scale), 0);
    m.opacity = 0;
    m.visible = false;
    scene.add(m);
    detail.current = m;
    let live = true;
    m.initialized.then(() => { if (live) detailReady.current = true; }).catch(() => undefined); // the room's copy stays
    return () => { live = false; scene.remove(m); m.dispose(); detail.current = null; };
  }, [fullUrl, splat?.id, scene]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const st = useGate.getState().stage;
    const show = ready.current && (st === 'forming' || st === 'memory' || st === 'leaving');
    const d = detail.current, dtc = Math.min(dt, 0.05);
    if (d) {
      // The splat budget around the visitor: what the headset carries at its frame rate, more on a computer.
      spark.lodSplatCount = gl.xr.isPresenting ? 500_000 : COARSE ? 600_000 : 1_200_000;
      const showDetail = show && detailReady.current;
      d.opacity = damp(d.opacity, showDetail ? 1 : 0, showDetail ? 0.7 : 3, dtc);
      d.visible = d.opacity > 0.01;
    }
    // The room's copy steps aside once the full detail has fully come in over it.
    const base = show && !(d && detailReady.current && d.opacity > 0.97);
    m.opacity = damp(m.opacity, base ? 1 : 0, base ? 0.7 : 3, dtc);
    m.visible = m.opacity > 0.01;
  });
  return null;
}

/** Worlds whose full-resolution export is in the app (fixtures/worlds/*.json): the Red Kite meadow, 1.92M splats. */
const FULL_SOURCE: Record<string, string> = { '0b84554c-b182-4b3e-a7bb-78f15822a49d': '/red-kite/meadow-full.spz' };
const COARSE = matchMedia('(pointer: coarse)').matches;
