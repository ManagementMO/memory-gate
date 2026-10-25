import { OBJECT_TOPICS, topicForKind } from '../../../../actors/historical-memory-atlas/src/knowledge.mjs';
import { entryOf } from '../../../../packages/shared/src/scene';
import { SCENE_DISCOVERY_HINTS } from './sceneHints';
import type { InfoTarget } from './state';

type Thing = { id: string; kind: string; label: string; scale?: number };
type PerspectiveThing = { memoryId: string; perspectiveId: string; data: Thing };
type OptionalThing = { _id: string; status: string; memoryKey?: string; perspective: string; assetKey: string | null; choice: string; size: number };
export type DiscoverySnapshot = {
  planObjects: readonly Thing[];
  perspectiveObjects: readonly PerspectiveThing[];
  optionalObjects: readonly OptionalThing[];
  memoryKey: string;
  perspectiveId: string;
  viewing: string;
  photoWorld: boolean;
  worldId: string | null;
};

/** Read-only adapter: a snapshot becomes annotations. It cannot mutate the planner, POV, camera or scene. */
export function buildInfoTargets(snapshot: DiscoverySnapshot): InfoTarget[] {
  const targets: InfoTarget[] = [], seen = new Set<string>();
  const add = (o: Thing) => {
    const topic = topicForKind(o.kind); if (!topic || o.kind === 'spool' || seen.has(o.id)) return; seen.add(o.id);
    targets.push({ id: o.id, label: o.label.length > 32 ? OBJECT_TOPICS[topic].label : o.label, topic,
      node: o.kind === 'kite' ? 'memory-held-spool' : `memory-${o.id}`,
      lift: o.kind === 'kite' ? .16 : Math.min(1.7, entryOf(o.kind).h * (o.scale ?? 1)) + .16 });
  };
  for (const o of snapshot.planObjects) add(o);
  for (const o of snapshot.perspectiveObjects) if (o.memoryId === snapshot.memoryKey && o.perspectiveId === snapshot.perspectiveId) add(o.data);
  if (snapshot.photoWorld) for (const world of SCENE_DISCOVERY_HINTS) {
    if (world.worldId !== snapshot.worldId) continue;
    for (const hint of world.targets) targets.push({ ...hint, ...(hint.anchor ? { anchor: [...hint.anchor] as [number, number, number] } : {}) });
  }
  for (const o of snapshot.optionalObjects) {
    if (o.status !== 'placed' || (o.memoryKey ?? 'red-kite') !== snapshot.memoryKey || ![snapshot.viewing, 'shared'].includes(o.perspective)) continue;
    const kind = o.assetKey === 'flower' ? 'flower' : o.assetKey === 'kite' || o.choice.includes('kite') ? 'kite' : o.choice.replace('library:', ''), topic = topicForKind(kind);
    if (topic) targets.push({ id: `optional:${o._id}`, label: OBJECT_TOPICS[topic].label, topic, node: `MemoryObject:${o._id}`, lift: o.size + .14 });
  }
  return targets.slice(0, 12);
}
