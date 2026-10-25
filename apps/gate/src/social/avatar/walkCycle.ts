// A character's walk loop, sampled by hand rather than through an AnimationMixer: each frame every bone starts again
// from its rest pose, the walk is laid over it as much as the person is walking, and only then are the head and
// arms turned toward the real head and hands. (A mixer only writes values that changed since its last write, so
// those turns would pile up frame after frame whenever the walk stood still.) The loop walks in place; the figure
// is carried by the person's real movement, and the loop's pace follows their speed so the feet don't slide.
import * as THREE from 'three';

type Channel = { node: THREE.Object3D; path: 'quaternion' | 'position'; sample: THREE.Interpolant };
type Rest = { node: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 };

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class WalkCycle {
  readonly duration: number;
  /** How fast the walk would carry the character (m/s at its own size): its stance foot's speed. */
  readonly pace: number;
  private readonly channels: Channel[];

  constructor(root: THREE.Object3D, clip: THREE.AnimationClip, rest: RestPose) {
    this.duration = clip.duration;
    this.channels = clip.tracks.flatMap((track) => {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const node = root.getObjectByName(nodeName);
      if (!node || (propertyName !== 'quaternion' && propertyName !== 'position')) return [];
      return [{ node, path: propertyName, sample: track.InterpolantFactoryMethodLinear(undefined) }]; // quaternion tracks give a slerping one
    });
    this.pace = this.measurePace(root, rest);
  }

  /** Lay the walk at time t over the pose (weight 0: rest, 1: fully walking). */
  apply(t: number, weight: number): void {
    if (weight <= 0.001) return;
    const time = ((t % this.duration) + this.duration) % this.duration;
    for (const c of this.channels) {
      const r = c.sample.evaluate(time);
      if (c.path === 'quaternion') c.node.quaternion.slerp(_q.set(r[0]!, r[1]!, r[2]!, r[3]!), weight);
      else c.node.position.lerp(_v.set(r[0]!, r[1]!, r[2]!), weight);
    }
  }

  /** The stance foot (the lower one) slides back under a walk in place as fast as the walk would move forward. */
  private measurePace(root: THREE.Object3D, rest: RestPose): number {
    const feet = ['LeftToeBase', 'RightToeBase'].map((n) => findBone(root, n)).filter((b): b is THREE.Object3D => !!b);
    if (feet.length < 2) return 1;
    const N = 48, dt = this.duration / N, at: THREE.Vector3[][] = [];
    for (let i = 0; i <= N; i++) {
      rest.reset(); this.apply(i * dt, 1); root.updateMatrixWorld(true);
      at.push(feet.map((f) => root.worldToLocal(f.getWorldPosition(new THREE.Vector3()))));
    }
    rest.reset(); root.updateMatrixWorld(true);
    const speeds: number[] = [];
    for (let i = 0; i < N; i++) {
      const stance = at[i]![0]!.y < at[i]![1]!.y ? 0 : 1;
      const v = -(at[i + 1]![stance]!.z - at[i]![stance]!.z) / dt; // the characters face +Z
      if (v > 0) speeds.push(v);
    }
    speeds.sort((a, b) => a - b);
    return THREE.MathUtils.clamp(speeds[Math.floor(speeds.length / 2)] ?? 1, 0.4, 2);
  }
}

/** Every bone's pose as the file has it, to start again from each frame. */
export class RestPose {
  private readonly rests: Rest[] = [];
  constructor(root: THREE.Object3D) {
    root.traverse((o) => { if ((o as THREE.Bone).isBone) this.rests.push({ node: o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }); });
  }
  reset(): void { for (const r of this.rests) { r.node.position.copy(r.p); r.node.quaternion.copy(r.q); r.node.scale.copy(r.s); } }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  const want = norm(name);
  let found: THREE.Object3D | null = null;
  root.traverse((o) => { if (!found && (o as THREE.Bone).isBone && norm(o.name).endsWith(want)) found = o; });
  return found;
}

/** The loop to walk with, if the file has one ("Walk_InPlace", "walk", ...). */
export const walkClipOf = (clips: THREE.AnimationClip[]) => clips.find((c) => /walk/i.test(c.name)) ?? null;
