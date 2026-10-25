// Being together in the memory, for real: this device says where its eyes (and, in the headset, its hands) are,
// about ten times a second, and everyone else appears where they really are, at their perspective's height. People
// who aren't inside the memory yet (still at the gate, or without the exchange) stay the soft lights beside you.
// There is always someone across the room: when nobody is seeing through the other perspective, a stand-in waits at
// its spot. Someone seeing through the same eyes as you shares your spot, so you don't see them inside you. Everyone
// can walk about (Walking), and is seen walking.
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { deviceKind } from '../../presence/presence';
import { useMemory } from '../../flow/memory';
import { useGate } from '../../state/store';
import { fileUrl } from '../../backend/client';
import { attachFirstPersonLook, firstPersonPose } from '../firstPerson';
import { socialLink } from '../link';
import { facingOther, keepDefaultSpots, worldSpot } from '../spots';
import { inMeadow, worldViewpoints } from '../world';
import { MeadowKite } from './MeadowKite';
import { poses, useSocial, viewingPerspective } from '../store';
import { handAnchors } from '../xr/OriginRig';
import { Avatar, StandIn } from '../avatar/Avatar';
import { Walking } from './Walking';

const FRESH_MS = 5000;
const round = (v: number) => Math.round(v * 1000) / 1000;

/** The others standing in the memory right now (their lights step aside for their figures). */
export function inSceneIds(): Set<string> {
  const me = useSocial.getState().memberId;
  const now = Date.now();
  return new Set([...poses.values()].filter((p) => p.memberId !== me && p.inScene && p.head.length === 7 && now - p.receivedAt < FRESH_MS).map((p) => p.memberId));
}
/** Live figures to draw: everyone in the memory except those sharing your spot (seeing through your eyes). */
function visibleIds(): Set<string> {
  const mine = viewingPerspective().id;
  return new Set([...inSceneIds()].filter((id) => poses.get(id)?.perspectiveId !== mine));
}
/** Perspectives someone is seeing through in the memory right now (they need no stand-in). */
function occupiedPerspectives(): Set<string> {
  return new Set([...inSceneIds()].map((id) => poses.get(id)?.perspectiveId ?? '').filter(Boolean));
}
/** What this device draws right now (read by the automated checks, like window.__presence). */
const drawn: { figures: string[]; standIns: string[] } = { figures: [], standIns: [] };
(window as unknown as { __socialDrawn?: typeof drawn }).__socialDrawn = drawn;
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
function usePolledSet(read: () => Set<string>): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const t = setInterval(() => setIds((prev) => { const next = read(); return same(prev, next) ? prev : next; }), 400);
    return () => clearInterval(t);
  }, [read]);
  return ids;
}
export const useInSceneIds = () => usePolledSet(inSceneIds);

/** Across the room: whichever perspective nobody is seeing through gets a stand-in at its spot. */
function StandIns() {
  const viewing = useSocial((s) => s.viewing);
  const perspectives = useSocial((s) => s.perspectives);
  const avatars = useSocial((s) => s.avatars);
  useSocial((s) => s.spots); // a story moving a perspective moves its stand-in
  const occupied = usePolledSet(occupiedPerspectives);
  // A memory with its own people (the parents someone mentioned, the friends in a photo) needs no stand-in waiting in it.
  const ownPeople = useMemory((s) => !!s.plan?.people?.length);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []); // follow things settling
  const shown = ownPeople ? [] : perspectives.filter((p) => p.key !== viewing && !occupied.has(p.id));
  useEffect(() => { drawn.standIns = shown.map((p) => p.key); return () => { drawn.standIns = []; }; });
  return (
    <>
      {shown.map((p) => {
        const likeness = avatars.find((a) => a.memberId === p.claimedBy);
        return (
          <Suspense key={p.id} fallback={null}>
            <StandIn perspective={p.key} at={worldSpot(p.key)} eye={p.eyeHeight} yaw={facingOther(p.key)} color={p.color} url={likeness ? fileUrl(likeness.url) : null}
              name={p.claimedName || p.label} sub={p.claimedName ? p.label.toLowerCase() : ''} />
          </Suspense>
        );
      })}
    </>
  );
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hp = new THREE.Vector3();
const _hq = new THREE.Quaternion();
const handOf = (o: THREE.Object3D | null): number[] => {
  if (!o) return [];
  o.getWorldPosition(_hp); o.getWorldQuaternion(_hq);
  return [_hp.x, _hp.y, _hp.z, _hq.x, _hq.y, _hq.z, _hq.w].map(round);
};

function PosePublisher() {
  const camera = useThree((s) => s.camera);
  // Where this device's eyes are (world x/z and facing), for the automated checks.
  useEffect(() => {
    const e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), q = new THREE.Quaternion();
    (window as unknown as { __socialCamera?: () => { x: number; y: number; z: number; yaw: number } }).__socialCamera = () => {
      camera.getWorldPosition(p); camera.getWorldQuaternion(q);
      return { x: p.x, y: p.y, z: p.z, yaw: e.setFromQuaternion(q, 'YXZ').y };
    };
  }, [camera]);
  const last = useRef({ at: 0, sentAt: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), key: '' });
  useFrame(() => {
    if (!socialLink.live) return;
    const now = performance.now();
    const l = last.current;
    if (now - l.at < 100) return; // at most ten a second
    l.at = now;
    const g = useGate.getState();
    const day = g.stage === 'forming' || g.stage === 'memory' || g.stage === 'leaving';
    const inScene = day && (g.xr || !g.photoWorld || !!worldViewpoints());
    if (g.xr) { camera.getWorldPosition(_p); camera.getWorldQuaternion(_q); }
    else firstPersonPose(_p, _q); // phones and laptops stand at their spot, even while watching the overview
    const perspective = viewingPerspective();
    const perspectiveId = perspective.id.startsWith('local:') ? '' : perspective.id;
    const key = `${perspectiveId}|${inScene}|${g.xr}`;
    const moved = _p.distanceTo(l.p) > 0.01 || _q.angleTo(l.q) > 0.03 || key !== l.key;
    if (!moved && now - l.sentAt < 1000) return;
    l.p.copy(_p); l.q.copy(_q); l.key = key; l.sentAt = now;
    socialLink.post({
      type: 'pose', perspectiveId, device: deviceKind(g.xr), inScene,
      head: [_p.x, _p.y, _p.z, _q.x, _q.y, _q.z, _q.w].map(round),
      left: g.xr ? handOf(handAnchors.left) : [], right: g.xr ? handOf(handAnchors.right) : [],
    });
  });
  return null;
}

function FirstPersonLook() {
  const gl = useThree((s) => s.gl);
  useEffect(() => attachFirstPersonLook(gl.domElement), [gl]);
  return null;
}

export function SocialLayer() {
  const ids = usePolledSet(visibleIds);
  const stage = useGate((s) => s.stage);
  const plan = useMemory((s) => s.plan);
  const live = useSocial((s) => s.status === 'live');
  // Once the memory has formed, the host keeps where the two perspectives start, so every device agrees.
  useEffect(() => { if (stage !== 'memory' || !live) return; const t = setTimeout(keepDefaultSpots, 1200); return () => clearTimeout(t); }, [stage, live, plan]);
  const placed = (stage === 'memory' || stage === 'leaving') && !!plan;
  const worldId = useSocial((s) => s.worldId);
  const photoWorld = useGate((s) => s.photoWorld);
  // A meadow the conversation brought in (a prepared place) shows the kite only once it's mentioned, in the visitor's
  // hands (scene/sketch/HeldKite), so the story's resting kite stays out of it.
  const preparedPlace = useMemory((s) => s.place);
  const meadow = !!worldId && !!photoWorld && inMeadow() && !preparedPlace;
  useEffect(() => { drawn.figures = [...ids]; }, [ids]);
  return (
    <group name="social" userData={{ noPoint: true }}>
      <PosePublisher />
      <FirstPersonLook />
      <Walking />
      {/* Each figure loads (its name's font, its likeness) behind its own boundary: a suspension inside the canvas
          would otherwise reach the page's boundary and briefly unmount everything, presence included. */}
      {stage !== 'album' && [...ids].map((id) => <Suspense key={id} fallback={null}><Avatar memberId={id} /></Suspense>)}
      {placed && <StandIns />}
      {placed && meadow && <Suspense fallback={null}><MeadowKite /></Suspense>}
    </group>
  );
}
