// A shared photo, in 3D: when the session's photo has a splat (SHARP on the GPU worker, or a World Labs world),
// the memory becomes a living photograph seen from where the photo was taken. Sketch things said later still form
// inside it. Only a splat made from this photo is ever shown (the bundled sample only for the sample photo).
import { useQuery } from 'convex/react';
import { useFrame, useThree } from '@react-three/fiber';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '../../../../convex/_generated/api';
import { fileUrl } from '../backend/client';
import { useGate } from '../state/store';
import { damp } from './util';
import { environmentFarPlane } from '../../../../packages/shared/src/worldlabs';
import { worldStatus } from './worldStatus';
import { useMemory } from '../flow/memory';
import { COURTYARD_WORLD_ID, MEADOW_WORLD_ID } from '../social/world';
import type { PlaceKey } from '../../../../packages/shared/src/places';

/** The eye height of a splat's camera above its floor (metres). */
export const splatEye = (floorY: number | null, scale: number) => (floorY !== null ? -floorY * scale : 1.2);

export function PhotoWorld() {
  const session = useGate((s) => s.session);
  const media = useGate((s) => s.media);
  const view = useQuery(api.rooms.get, session ? { code: session.code, token: session.token } : 'skip');
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => { preloadWorlds(); }, []);
  // A prepared place whose world ships with the app (the Red Kite meadow) is drawn from its own files the moment the
  // place is chosen, never waiting on the backend or its storage (which still record it for everyone in the visit),
  // and those files were preloaded while the visit began (preloadWorlds).
  const place = useMemory((s) => s.place);
  const photoUrl = useMemory((s) => s.photoUrl);
  const room = view?.splat;
  const local = place ? LOCAL_WORLDS[place] : undefined;
  // The room keeps the last world it showed from one visit to the next, so only a world made for this memory is shown
  // in it: a prepared place's world in a memory in that place (after the meadow, a garden is never the meadow again),
  // a photo's world while that photo is part of this memory. A world made from the story itself shows as before.
  const preparedFor = room?.worldId ? PREPARED_WORLDS[room.worldId] : undefined;
  const ours = !room ? false : preparedFor ? preparedFor === place : !!room.sourceStory || !!media || !!photoUrl;
  const splat = local
    ? { id: local.id, status: 'ready' as const, source: 'worldlabs' as const, url: local.lite, liteUrl: local.lite, worldId: local.worldId, scale: local.scale, floorY: local.floorY }
    : ours ? room : null;
  // Real generations from this photo always; the bundled sample splat only when the sample photo was shared.
  const isSample = !!media && /sample-photo-1938/.test(media.name);
  const usable = !!splat && splat.status === 'ready' && !!splat.url && (splat.source === 'sharp' || splat.source === 'worldlabs' || (splat.source === 'prebaked' && isSample));
  // The headset sees the same world as the browser. The 100k export of a World Labs world lost too much in stereo (the
  // Red Kite page found the same), so the lighter file is for photo splats on a headset, or when asked for (?lite=1).
  const liteAsked = new URLSearchParams(location.search).get('lite');
  const lite = !local && !!splat?.liteUrl && (liteAsked === '1' || (liteAsked !== '0' && splat.source !== 'worldlabs' && /OculusBrowser|Quest/i.test(navigator.userAgent)));
  // A world that ships with the app starts from its 500k copy (the one Mo's page shows before its full detail; the 100k
  // light copy was blurry in the headset for the half minute the full detail takes), and the full detail fades in over
  // it once that's showing (below): never a white wait, and one download at a time. ?lite=1: the light copy only.
  const url = usable ? (local ? (liteAsked === '1' ? local.lite : local.base) : fileUrl(lite ? splat!.liteUrl : splat!.url)) : null;

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
  // Made inside the effect, so whatever disposes it (a kernel change, leaving, or React's development double mount)
  // disposes only its own: a renderer kept in useMemo was disposed by that double mount and then shown, and drew
  // nothing wherever the world was already known when this mounted (a guest's headset).
  const kernel = splat?.source === 'worldlabs' ? Math.sqrt(8) : Math.sqrt(5);
  const spark = useRef<SparkRenderer | null>(null);
  useEffect(() => {
    const s = new SparkRenderer({ renderer: gl, maxStdDev: kernel, lodCleanupTimeoutMs: Infinity } as ConstructorParameters<typeof SparkRenderer>[0]);
    const mat = (s as unknown as { material?: THREE.Material }).material;
    if (mat) mat.forceSinglePass = true;
    scene.add(s);
    spark.current = s;
    return () => { scene.remove(s); s.dispose(); if (spark.current === s) spark.current = null; };
  }, [gl, scene, kernel]);

  const mesh = useRef<SplatMesh | null>(null);
  const ready = useRef(false);
  const [baseReady, setBaseReady] = useState(false);

  useEffect(() => {
    if (!url || !splat) return;
    ready.current = false;
    setBaseReady(false);
    worldStatus.loading = true;
    const m = new SplatMesh({ url, raycastable: false } as ConstructorParameters<typeof SplatMesh>[0]);
    m.quaternion.set(1, 0, 0, 0); // OpenCV (x right, y down, z forward) → three.js
    m.scale.setScalar(splat.scale);
    m.position.set(0, splatEye(splat.floorY, splat.scale), 0);
    m.opacity = 0;
    scene.add(m);
    mesh.current = m;
    let live = true;
    m.initialized.then(() => { if (live) { ready.current = true; setBaseReady(true); worldStatus.loading = false; useGate.getState().set({ photoWorld: { eye: splatEye(splat.floorY, splat.scale) } }); } }).catch(() => { if (live) worldStatus.loading = false; });
    return () => { live = false; worldStatus.loading = false; scene.remove(m); m.dispose(); mesh.current = null; useGate.getState().set({ photoWorld: null }); };
  }, [url, splat?.id, scene]);

  // A world whose full-resolution export ships with the app comes in twice: the room's copy first (it arrives in
  // seconds), then the full source with Spark's level of detail, faded in over it once loaded, so what's near the
  // visitor keeps the source's own detail (the Red Kite page does the same; a uniformly reduced copy can't).
  const fullUrl = usable && local && liteAsked !== '1' ? local.full : null;
  const detail = useRef<SplatMesh | null>(null);
  const detailReady = useRef(false);
  useEffect(() => {
    if (!fullUrl || !splat || !baseReady) return; // after the first copy is showing: one download at a time
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
  }, [fullUrl, splat?.id, scene, baseReady]);

  // Diagnostics (?emulate=1): which copy of the world is showing, and how much of it.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('emulate') !== '1') return;
    const w = window as unknown as { __photoWorld?: () => unknown };
    w.__photoWorld = () => ({
      url, fullUrl, baseReady: ready.current, detailReady: detailReady.current,
      base: mesh.current ? { opacity: +mesh.current.opacity.toFixed(2), visible: mesh.current.visible } : null,
      detail: detail.current ? { opacity: +detail.current.opacity.toFixed(2), visible: detail.current.visible } : null,
      budget: spark.current?.lodSplatCount ?? null, active: (spark.current as unknown as { activeSplats?: number } | null)?.activeSplats ?? null,
    });
    return () => { delete w.__photoWorld; };
  });
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const st = useGate.getState().stage;
    const show = ready.current && (st === 'forming' || st === 'memory' || st === 'leaving');
    const d = detail.current, dtc = Math.min(dt, 0.05);
    if (d) {
      // The splat budget around the visitor: what the headset carries at its frame rate, more on a computer.
      if (spark.current) spark.current.lodSplatCount = gl.xr.isPresenting ? 500_000 : COARSE ? 600_000 : 1_200_000;
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

/** The prepared places' worlds (the room records one when a memory steps into that place), by their World Labs id. */
const PREPARED_WORLDS: Record<string, PlaceKey> = { [MEADOW_WORLD_ID]: 'red-kite', [COURTYARD_WORLD_ID]: 'courtyard' };

type LocalWorld = { id: string; worldId: string; scale: number; floorY: number; lite: string; base: string; full: string };
/** Worlds that ship with the app (fixtures/worlds/*.json): their light copy and their full-resolution export, in the
 *  app's own files. The world's own floor estimate holds for what is seen: measured from the meadow's splats, its ground
 *  under the entrance, the viewpoints and every prop spot is at the floor (within a few cm; 0.2 m on the bank by the
 *  left bench). Its collision mesh sits about 1.15 m lower, so that mesh's correction belongs to walking, never to the
 *  splats. */
export const LOCAL_WORLDS: Record<string, LocalWorld> = {
  'red-kite': { id: 'local:red-kite', worldId: '0b84554c-b182-4b3e-a7bb-78f15822a49d', scale: 2.6397884, floorY: -0.5775501930381995,
    lite: '/red-kite/meadow-lite.spz', base: '/red-kite/meadow-500k.spz', full: '/red-kite/meadow-full.spz' }, // 100k (1.4 MB), 500k (8 MB), 1.92M (30.8 MB)
};

/** Fetch the worlds that ship with the app into the browser's cache while a visit begins: the first copies at once,
 *  the full detail after a pause (so it doesn't slow the start), each once. Saying "the hill" then shows it at once. */
let preloaded = false;
export function preloadWorlds(): void {
  if (preloaded) return;
  preloaded = true;
  const get = (u: string) => fetch(u, { priority: 'low' } as RequestInit).then((r) => r.arrayBuffer()).catch(() => undefined);
  for (const w of Object.values(LOCAL_WORLDS)) void get(w.base);
  setTimeout(() => { for (const w of Object.values(LOCAL_WORLDS)) void get(w.full); }, 8000);
}
const COARSE = matchMedia('(pointer: coarse)').matches;
