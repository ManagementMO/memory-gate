import { useGLTF } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { clampSpool, SPOOL_DOCK, stepMotion, type MotionState } from './motion';

export type KiteLook = { visible: boolean; color: 'red' | 'orange' | null; ribbon: 'cream' | null };
type CaptureTarget = { setPointerCapture: (id: number) => void; releasePointerCapture: (id: number) => void };
/** Clone materials, not cached geometry: one participant's illustration must not recolor another's. */
function useAsset(key: string) {
  const { scene } = useGLTF(`/red-kite/models/${key}.glb`);
  const clone = useMemo(() => {
    const model = scene.clone(true);
    model.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m => m.clone());
      o.material = Array.isArray(o.material) ? mats : mats[0]!;
    });
    return model;
  }, [scene]);
  useEffect(() => () => { clone.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); }); }, [clone]);
  return clone;
}

export function MemoryProps({ look, proposed, paused, reduced, motion, onKeepsake, onReady }: {
  look: KiteLook; proposed: boolean; paused: RefObject<boolean>; reduced: RefObject<boolean>; motion: RefObject<MotionState>; onKeepsake: () => void; onReady: () => void;
}) {
  const kite = useAsset('kite'), spool = useAsset('spool'), table = useAsset('side-table');
  const box = useAsset('keepsake-box'), card = useAsset('story-card');
  const kiteGroup = useRef<THREE.Group>(null), spoolGroup = useRef<THREE.Group>(null);
  const lid = useMemo(() => box.getObjectByName('LidPivot'), [box]);
  const open = useRef(false), captured = useRef<{ id: number; depth: number; target: CaptureTarget } | null>(null);
  const start = useMemo(() => new THREE.Vector3(), []), end = useMemo(() => new THREE.Vector3(), []), hit = useMemo(() => new THREE.Vector3(), []);
  const tail = useMemo(() => Array.from({ length: 9 }, (_, i) => kite.getObjectByName(`Tail_${String(i).padStart(2, '0')}`)), [kite]);
  const anchors = useMemo(() => ({ kite: kite.getObjectByName('StringAnchor'), spool: spool.getObjectByName('StringExit') }), [kite, spool]);
  const thread = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#c3b18b', transparent: true, opacity: .85 }));
  }, []);
  useEffect(() => () => { thread.geometry.dispose(); thread.material.dispose(); }, [thread]);
  useEffect(() => {
    if (!anchors.kite || !anchors.spool || !lid || tail.some(x => !x)) throw new Error('A Red Kite model is missing its authored animation anchors.');
    onReady();
  }, [anchors, lid, tail, onReady]);
  useEffect(() => {
    kite.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        const m = material as THREE.MeshStandardMaterial;
        if (m.name === 'KitePaper') m.color.set(look.color === 'red' ? '#cc5c40' : look.color === 'orange' ? '#e99548' : '#e4d6b6');
        m.transparent = !look.visible; m.opacity = look.visible ? 1 : .24; m.depthWrite = look.visible;
      }
    });
    const t = kite.getObjectByName('TailRoot'); if (t) t.visible = look.ribbon === 'cream';
  }, [kite, look.visible, look.color, look.ribbon]);
  function dropCapture() {
    if (captured.current) {
      const c = captured.current; captured.current = null;
      try { c.target.releasePointerCapture(c.id); } catch { /* XR teardown may have already removed the pointer. */ }
    }
    motion.current.held = null;
  }
  useEffect(() => () => dropCapture(), [motion]);
  function release(e: ThreeEvent<PointerEvent>) {
    if (!captured.current || captured.current.id !== e.pointerId) return;
    e.stopPropagation(); captured.current = null; motion.current.held = null;
    (e.target as unknown as CaptureTarget).releasePointerCapture(e.pointerId);
  }
  useFrame((_, dt) => {
    if (spoolGroup.current) spoolGroup.current.userData.resting = paused.current;
    if (paused.current && captured.current) dropCapture();
    motion.current = stepMotion(motion.current, dt, paused.current, reduced.current);
    const s = motion.current, t = s.time, strength = reduced.current ? 0 : s.breeze;
    if (kiteGroup.current) {
      kiteGroup.current.position.set(.2 + Math.sin(t * .63) * .12, 2.35 + s.kiteLift + Math.sin(t * 1.1) * .07, -2.05 + Math.sin(t * .47) * .1);
      kiteGroup.current.rotation.set(.1 + Math.sin(t * .8) * .07, Math.sin(t * .44) * .23, -.08 + Math.sin(t * .7) * .12);
      for (let i = 0; i < tail.length; i++) { const node = tail[i]; if (node) node.rotation.z = Math.sin(t * (2.2 + strength) - i * .65) * (.1 + strength * .1); }
      kiteGroup.current.updateWorldMatrix(true, true);
    }
    if (spoolGroup.current) { spoolGroup.current.position.set(...s.spool); spoolGroup.current.rotation.x = strength * .3 + Math.sin(t) * .015; spoolGroup.current.updateWorldMatrix(true, true); }
    if (lid && !paused.current) lid.rotation.x = THREE.MathUtils.damp(lid.rotation.x, open.current ? -1.8 : 0, 5, Math.min(dt, .05));
    if (anchors.spool && anchors.kite) {
      anchors.spool.getWorldPosition(start); anchors.kite.getWorldPosition(end);
      const p = thread.geometry.getAttribute('position');
      for (let i = 0; i <= 32; i++) {
        const u = i / 32, sag = Math.sin(u * Math.PI) * (.16 - Math.min(1, strength) * .1);
        p.setXYZ(i, start.x + (end.x - start.x) * u, start.y + (end.y - start.y) * u - sag, start.z + (end.z - start.z) * u);
      }
      p.needsUpdate = true; thread.geometry.computeBoundingSphere();
    }
  });
  return <>
    <hemisphereLight args={['#f5e6ca', '#6b7252', 2.2]} />
    <directionalLight position={[-6, 8, 2]} color="#ffe1ab" intensity={2.4} />
    <primitive object={table} position={[SPOOL_DOCK[0], 0, SPOOL_DOCK[2]]} />
    <group name="RedKiteSpool" ref={spoolGroup} position={SPOOL_DOCK}
      onPointerDown={(e) => {
        if (paused.current || captured.current) return; e.stopPropagation();
        const target = e.target as unknown as CaptureTarget;
        captured.current = { id: e.pointerId, depth: e.ray.origin.distanceTo(spoolGroup.current!.position), target };
        target.setPointerCapture(e.pointerId); motion.current.held = [...motion.current.spool]; motion.current.grabs++;
      }}
      onPointerMove={(e) => {
        if (paused.current || captured.current?.id !== e.pointerId) return; e.stopPropagation();
        e.ray.at(captured.current.depth, hit); motion.current.held = clampSpool([hit.x, hit.y, hit.z]);
      }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={() => { captured.current = null; motion.current.held = null; }}>
      <primitive object={spool} />
      <mesh><sphereGeometry args={[.12, 12, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    </group>
    <group name="RedKiteKite" ref={kiteGroup} visible={look.visible || proposed}><primitive object={kite} /></group>
    <primitive object={thread} visible={look.visible || proposed} />
    <group position={[-.74, .765, -.77]} onClick={e => { if (paused.current) return; e.stopPropagation(); open.current = !open.current; onKeepsake(); }}>
      <primitive object={box} />
      <primitive object={card} position={[0, .035, .005]} rotation-x={-.6} />
    </group>
  </>;
}
