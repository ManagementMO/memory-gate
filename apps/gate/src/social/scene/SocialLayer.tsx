// Being together in the memory, for real: this device says where its eyes (and, in the headset, its hands) are,
// about ten times a second, and everyone else appears where they really are, at their perspective's height. People
// who aren't inside the memory yet (still at the gate, or without the exchange) stay the soft lights beside you.
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { deviceKind } from '../../presence/presence';
import { useGate } from '../../state/store';
import { attachFirstPersonLook, firstPersonPose } from '../firstPerson';
import { socialLink } from '../link';
import { poses, useSocial, viewingPerspective } from '../store';
import { handAnchors } from '../xr/OriginRig';
import { Avatar } from '../avatar/Avatar';

const FRESH_MS = 5000;
const round = (v: number) => Math.round(v * 1000) / 1000;

/** The others standing in the memory right now (their lights step aside for their figures). */
export function inSceneIds(): Set<string> {
  const me = useSocial.getState().memberId;
  const now = Date.now();
  return new Set([...poses.values()].filter((p) => p.memberId !== me && p.inScene && p.head.length === 7 && now - p.receivedAt < FRESH_MS).map((p) => p.memberId));
}
export function useInSceneIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const t = setInterval(() => setIds((prev) => { const next = inSceneIds(); return next.size === prev.size && [...next].every((x) => prev.has(x)) ? prev : next; }), 400);
    return () => clearInterval(t);
  }, []);
  return ids;
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
  const last = useRef({ at: 0, sentAt: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), key: '' });
  useFrame(() => {
    if (!socialLink.live) return;
    const now = performance.now();
    const l = last.current;
    if (now - l.at < 100) return; // at most ten a second
    l.at = now;
    const g = useGate.getState();
    const day = g.stage === 'forming' || g.stage === 'memory' || g.stage === 'leaving';
    const inScene = day && (g.xr || !g.photoWorld);
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
  const ids = useInSceneIds();
  const stage = useGate((s) => s.stage);
  return (
    <group name="social" userData={{ noPoint: true }}>
      <PosePublisher />
      <FirstPersonLook />
      {/* Each figure loads (its name's font, its likeness) behind its own boundary: a suspension inside the canvas
          would otherwise reach the page's boundary and briefly unmount everything, presence included. */}
      {stage !== 'album' && [...ids].map((id) => <Suspense key={id} fallback={null}><Avatar memberId={id} /></Suspense>)}
    </group>
  );
}
