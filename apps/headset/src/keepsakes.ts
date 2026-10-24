import { Grabbed, GrabSystem, OneHandGrabbable, RayInteractable, Vector3, type World } from '@iwsdk/core';
import type { MemoryObject } from './look/memoryObject';
import type { ObjectRecord } from './objects';

type TransformEntity = ReturnType<World['createTransformEntity']>;

/** Local inspection uses IWSDK proximity squeeze. It never writes a remembered placement. */
export class Keepsakes {
  private items = new Map<string, { entity: TransformEntity; view: MemoryObject; active: boolean }>();
  constructor(private world: World, private memory: TransformEntity) {}

  attach(record: ObjectRecord, view: MemoryObject): void {
    if (record.label !== 'photograph' || String(record.id).startsWith('preview-')) return;
    const entity = this.world.createTransformEntity(view.root, { parent: this.memory });
    entity.addComponent(RayInteractable);
    this.items.set(record.id, { entity, view, active: false });
  }

  remove(id: string): void {
    const item = this.items.get(id);
    if (!item) return;
    if (item.entity.hasComponent(Grabbed)) this.world.getSystem(GrabSystem)?.forceRelease(item.entity);
    item.entity.destroy(); this.items.delete(id);
  }

  update(paused: boolean): void {
    for (const item of this.items.values()) {
      const available = !paused && item.view.confirmedLike && !item.view.isPlaceholder;
      if (available !== item.active) {
        if (available) item.entity.addComponent(OneHandGrabbable, { translate: true, rotate: true });
        else {
          if (item.entity.hasComponent(Grabbed)) this.world.getSystem(GrabSystem)?.forceRelease(item.entity);
          item.entity.removeComponent(OneHandGrabbable);
        }
        item.active = available;
      }
      const held = item.entity.hasComponent(Grabbed);
      if (!held && item.view.root.parent !== this.memory.object3D) this.memory.object3D!.attach(item.view.root);
      item.view.setInspecting(held);
    }
  }

  snapshot() {
    return [...this.items].map(([id, item]) => ({ id, entityIndex: item.entity.index, held: item.entity.hasComponent(Grabbed),
      active: item.active, position: item.view.root.position.toArray(), center: item.view.worldBox().getCenter(new Vector3()).toArray() }));
  }
}
