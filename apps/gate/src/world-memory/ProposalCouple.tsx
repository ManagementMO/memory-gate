// The couple in the proposal memory: one rigged scene (prepare-proposal.mjs), a man on one knee holding an open ring
// box and a woman with her hands over her mouth, breathing in a 4 s loop. They stand on the meadow's walkable ground
// at their spot in the clearing, side-on to the path so both faces read. Reduced motion holds them still.
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MeadowTraversal } from '../red-kite/traversal';

export const COUPLE_URL = '/memories/proposal/proposal.glb';
/** Where they stand (metres, the Red Kite page's frame): in the clearing ahead of the path viewpoint, turned so he
 *  kneels on the left facing her and she stands on the right. */
export const COUPLE_SPOT = { x: 0.15, z: -2.7, yaw: Math.PI / 2 };

export function ProposalCouple({ traversal, reduced, onReady }: {
  traversal: RefObject<MeadowTraversal | null>; reduced: RefObject<boolean>; onReady: (ready: boolean) => void;
}) {
  const gltf = useGLTF(COUPLE_URL);
  const model = useMemo(() => {
    const m = clone(gltf.scene);
    // Skinned bounds don't follow the pose; never let the pair blink out at the edge of the view.
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; });
    return m;
  }, [gltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  useEffect(() => {
    const clip = gltf.animations[0];
    const action = clip ? mixer.clipAction(clip).play() : null;
    return () => { action?.stop(); mixer.uncacheRoot(model); };
  }, [gltf.animations, mixer, model]);
  useEffect(() => () => onReady(false), [onReady]);

  const group = useRef<THREE.Group>(null), standing = useRef<MeadowTraversal | null>(null);
  useFrame((_, dt) => {
    const g = group.current, world = traversal.current;
    // Stand them on the walking surface once it exists (and again if it's rebuilt).
    if (g && world && standing.current !== world) {
      const ground = world.groundAt(COUPLE_SPOT.x, COUPLE_SPOT.z, 4, 20);
      if (ground !== null) { g.position.y = ground; g.visible = true; standing.current = world; onReady(true); }
    }
    if (!reduced.current) mixer.update(dt);
  });
  return (
    <group ref={group} name="ProposalCouple" position={[COUPLE_SPOT.x, 0, COUPLE_SPOT.z]} rotation-y={COUPLE_SPOT.yaw} visible={false}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(COUPLE_URL);
