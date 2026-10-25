import RAPIER, { type Collider, type KinematicCharacterController, type RigidBody, type World } from '@dimforge/rapier3d-compat';
import type { Point3 } from './viewpoints';

export type CollisionGeometry = { vertices: Float32Array; indices: Uint32Array };
let initialized: Promise<void> | undefined;
const HALF_HEIGHT = .55, RADIUS = .23, CENTER = HALF_HEIGHT + RADIUS;

/** Render-independent, real mesh collision. Shared by the desktop and WebXR camera rigs. */
export class MeadowTraversal {
  readonly world: World;
  readonly character: KinematicCharacterController;
  readonly body: RigidBody;
  readonly capsule: Collider;
  readonly verticalShift: number;
  readonly triangles: number;
  grounded = false;
  edgeBlocked = false;
  distance = 0;
  private velocityY = 0;
  private lastSafe: Point3 = [0, 0, .25];
  private disposed = false;

  constructor(geometry: CollisionGeometry[], options: { normalizeSpawn?: boolean; table?: boolean }) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 90;
    const terrain = geometry.map(g => {
      if (!g.vertices.length || g.vertices.length % 3 || !g.indices.length || g.indices.length % 3) throw new Error('The meadow collision mesh is incomplete.');
      return this.world.createCollider(RAPIER.ColliderDesc.trimesh(g.vertices, g.indices));
    });
    this.triangles = geometry.reduce((n, g) => n + g.indices.length / 3, 0);
    this.world.step();
    const rawGround = this.groundAt(0, .25, 2.5, 20);
    if (rawGround === null) { this.world.free(); throw new Error('The exported meadow mesh has no walkable ground at the story entrance.'); }
    this.verticalShift = options.normalizeSpawn === false ? 0 : -rawGround;
    for (const c of terrain) c.setTranslation({ x: 0, y: this.verticalShift, z: 0 });
    if (options.table !== false) this.world.createCollider(RAPIER.ColliderDesc.cuboid(.28, .3825, .28).setTranslation(-.55, .3825, -.7));
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CENTER + .03, .25));
    this.capsule = this.world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);
    this.character = this.world.createCharacterController(.02);
    this.character.enableAutostep(.28, .15, false);
    this.character.enableSnapToGround(.25);
    this.character.setMaxSlopeClimbAngle(Math.PI / 4);
    this.character.setMinSlopeSlideAngle(Math.PI * 50 / 180);
    this.world.step();
    this.place([0, 0, .25]);
  }

  get feet(): Point3 { const p = this.body.translation(); return [p.x, p.y - CENTER, p.z]; }

  groundAt(x: number, z: number, fromY: number, distance = 2): number | null {
    const ray = new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, distance, false, undefined, undefined, this.capsule);
    return hit && hit.normal.y >= .62 ? fromY - hit.timeOfImpact : null;
  }

  /** Used for the two authored anchors and explicit return-to-story, never on every frame. */
  place(point: Point3): void {
    const ground = this.groundAt(point[0], point[2], point[1] + 2, 12);
    if (ground === null) throw new Error('That story viewpoint is outside the walkable meadow.');
    const p = { x: point[0], y: ground + CENTER + .025, z: point[2] };
    this.body.setTranslation(p, true); this.body.setNextKinematicTranslation(p);
    this.world.step(); this.velocityY = 0; this.grounded = false; this.edgeBlocked = false;
    this.lastSafe = [point[0], ground, point[2]];
    for (let i = 0; i < 8; i++) this.step([0, 0], 1 / 90);
  }

  step(delta: [number, number], dt: number, jump = false, paused = false): Point3 {
    if (paused || this.disposed) return this.feet;
    const d = Number.isFinite(dt) ? Math.max(0, Math.min(.05, dt)) : 0;
    if (d === 0) return this.feet;
    if (this.grounded && this.velocityY <= 0 && !jump && delta[0] === 0 && delta[1] === 0) return this.feet;
    const steps = Math.max(1, Math.ceil(d * 90)), h = d / steps;
    const dx = Number.isFinite(delta[0]) ? delta[0] / steps : 0, dz = Number.isFinite(delta[1]) ? delta[1] / steps : 0;
    if (jump && this.grounded) this.velocityY = 3.8;
    this.edgeBlocked = false;
    for (let i = 0; i < steps; i++) {
      const before = this.feet;
      let x = dx, z = dz;
      // A generated world is finite. Missing/very steep ground is an edge, not an infinite proxy floor.
      if (this.grounded && this.velocityY <= 0 && this.groundAt(before[0] + x, before[2] + z, before[1] + .4, 1.5) === null) {
        x = z = 0; this.edgeBlocked = true;
      }
      this.velocityY = Math.max(-12, this.velocityY - 9.81 * h);
      if (this.velocityY > 0) this.character.disableSnapToGround(); else this.character.enableSnapToGround(.25);
      this.character.computeColliderMovement(this.capsule, { x, y: this.velocityY * h, z });
      const move = this.character.computedMovement(), current = this.body.translation();
      this.body.setNextKinematicTranslation({ x: current.x + move.x, y: current.y + move.y, z: current.z + move.z });
      this.world.timestep = h; this.world.step();
      const resolved = this.feet;
      const floor = this.velocityY <= 0 ? this.groundAt(resolved[0], resolved[2], resolved[1] + .1, .2) : null;
      // Coarse generated meshes contain near-coplanar seams. A real floor within the controller's
      // contact offset is also ground, so resting at those seams cannot accumulate numerical drift.
      this.grounded = this.velocityY <= 0 && (this.character.computedGrounded() || (floor !== null && Math.abs(resolved[1] - floor) < .04));
      if (this.grounded && this.velocityY < 0) this.velocityY = 0;
      if (this.velocityY > 0 && move.y < this.velocityY * h * .5) this.velocityY = 0; // ceiling
      const feet = this.feet;
      this.distance += Math.hypot(feet[0] - before[0], feet[2] - before[2]);
      if (this.grounded) this.lastSafe = feet;
      if (!feet.every(Number.isFinite) || feet[1] < this.lastSafe[1] - 3) {
        this.place(this.lastSafe); this.edgeBlocked = true; break;
      }
    }
    return this.feet;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.world.removeCharacterController(this.character); this.world.free();
  }
}

export async function createTraversal(geometry: CollisionGeometry[], options: { normalizeSpawn?: boolean; table?: boolean } = {}): Promise<MeadowTraversal> {
  initialized ??= RAPIER.init();
  await initialized;
  return new MeadowTraversal(geometry, options);
}
