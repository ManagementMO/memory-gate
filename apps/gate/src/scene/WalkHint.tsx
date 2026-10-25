// A word, the first time someone can walk somewhere in the headset: in their view for a few seconds, then gone.
import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';

const shown = new Set<string>(); // each hint once per page
const _head = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export function WalkHint({ id, text, when }: { id: string; text: string; when: () => boolean }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const g = useRef<THREE.Group>(null);
  const until = useRef(0);
  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const now = performance.now();
    if (gl.xr.isPresenting && !shown.has(id) && when()) { shown.add(id); until.current = now + 7000; }
    grp.visible = now < until.current;
    if (!grp.visible) return;
    camera.getWorldPosition(_head);
    const yaw = _e.setFromQuaternion(camera.getWorldQuaternion(_q), 'YXZ').y;
    // A little above the line of sight: clear of the captions below it and of any panel at chest height.
    grp.position.set(_head.x - Math.sin(yaw) * 1.4, _head.y + 0.16, _head.z - Math.cos(yaw) * 1.4);
    grp.lookAt(_head.x, grp.position.y, _head.z);
  });
  return (
    <group ref={g} visible={false}>
      <Text font={fontUrl} fontSize={0.04} maxWidth={0.9} textAlign="center" anchorX="center" anchorY="middle" color="#ffffff"
        outlineWidth={0.004} outlineColor="#1d1c2e" renderOrder={1999} material-depthTest={false} material-toneMapped={false}>{text}</Text>
    </group>
  );
}
