// The kite in the meadow. In the team's Red Kite story the kite flies just above the open path and its spool rests
// on a little table within reach there; that is where the grandchild stands. These are Mohammed's own models and
// positions (apps/gate/public/red-kite, apps/gate/src/red-kite: read only), shown quietly here: the paper stays a
// neutral finish and the ribbon stays off, because in the story its colour is only chosen from a telling.
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SPOOL_DOCK } from '../../red-kite/motion';

const NEUTRAL_PAPER = '#e4d6b6';
function useModel(key: string): THREE.Object3D {
  const { scene } = useGLTF(`/red-kite/models/${key}.glb`);
  return useMemo(() => scene.clone(true), [scene]);
}

export function MeadowKite() {
  const kite = useModel('kite'), spool = useModel('spool'), table = useModel('side-table');
  const kiteGroup = useRef<THREE.Group>(null);
  const anchors = useMemo(() => {
    kite.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && o.name === 'KitePaper') { (o as THREE.Mesh).material = m.clone(); ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(NEUTRAL_PAPER); }
    });
    const tail = kite.getObjectByName('TailRoot');
    if (tail) tail.visible = false;
    return { kite: kite.getObjectByName('StringAnchor'), spool: spool.getObjectByName('StringExit') };
  }, [kite, spool]);
  const thread = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#e9dcc0', transparent: true, opacity: 0.85 }));
  }, []);
  const start = useMemo(() => new THREE.Vector3(), []), end = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = kiteGroup.current;
    if (!k) return;
    // The same gentle breeze as the story's kite (props.tsx), resting at its docked height.
    k.position.set(0.2 + Math.sin(t * 0.63) * 0.12, 2.35 + Math.sin(t * 1.1) * 0.07, -2.05 + Math.sin(t * 0.47) * 0.1);
    k.rotation.set(0.1 + Math.sin(t * 0.8) * 0.07, Math.sin(t * 0.44) * 0.23, -0.08 + Math.sin(t * 0.7) * 0.12);
    k.updateWorldMatrix(true, true);
    if (!anchors.kite || !anchors.spool) return;
    anchors.spool.getWorldPosition(start); anchors.kite.getWorldPosition(end);
    const p = thread.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i <= 32; i++) {
      const f = i / 32;
      p.setXYZ(i, THREE.MathUtils.lerp(start.x, end.x, f), THREE.MathUtils.lerp(start.y, end.y, f) - Math.sin(f * Math.PI) * 0.18, THREE.MathUtils.lerp(start.z, end.z, f));
    }
    p.needsUpdate = true; thread.geometry.computeBoundingSphere();
  });
  return (
    <group name="meadow-kite" userData={{ noPoint: true }}>
      <primitive object={table} position={[SPOOL_DOCK[0], 0, SPOOL_DOCK[2]]} />
      <group position={SPOOL_DOCK}><primitive object={spool} /></group>
      <group ref={kiteGroup}><primitive object={kite} /></group>
      <primitive object={thread} />
    </group>
  );
}
