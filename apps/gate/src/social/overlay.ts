// What one perspective adds to the place. Inside a memory, "there was a little stool by the stove" told through the
// grandchild's eyes becomes the grandchild's stool: drawn solid for whoever sees through those eyes, and as a faint
// ghost for the others. The shared plan the memory was drawn from is never changed (sketch.detail with persist:false);
// each new thing is given a fixed spot here, so every device draws it in the same place.
import { api } from '../../../../convex/_generated/api';
import { layout, planOffline, validatePlan, type PlanObject, type Placement, type ScenePlan } from '../../../../packages/shared/src/scene';
import { convex } from '../backend/client';
import { useMemory } from '../flow/memory';
import { useGate } from '../state/store';
import { socialLink } from './link';
import { memoryKey } from './perspectives';
import { notify, useSocial, viewingPerspective } from './store';
import { recogniseNamed, shapeNamed } from '../object-info/state';

/** The shared memory's placements as drawn on this device (published by MemoryScene). */
export const memoryPlacements = { current: new Map<string, Placement>() };

const short = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** The things this perspective already added to the memory being visited. */
export function overlayObjects(perspectiveId = viewingPerspective().id) {
  const mem = memoryKey();
  return useSocial.getState().objects.filter((o) => o.perspectiveId === perspectiveId && o.memoryId === mem);
}

/** True when details said now belong to a perspective (the exchange keeps them) rather than the shared plan. */
export const overlayActive = () => socialLink.ready && !!useMemory.getState().plan;

/** Adds what these words name to this perspective's place; resolves to the things added (with their spots). */
export async function addPerspectiveDetail(text: string, storyId: string | null): Promise<{ data: PlanObject; place: Placement }[]> {
  const shared = useMemory.getState().plan;
  if (!shared || !socialLink.ready) return [];
  const p = viewingPerspective();
  const mine = overlayObjects(p.id);
  // A plan holds at most 16 things: leave room for what these words add.
  const known: PlanObject[] = [...shared.objects, ...mine.map((o) => o.data)];
  const merged: ScenePlan = { ...shared, objects: known.slice(-13) };
  let fresh: PlanObject[] = [];
  const s = useGate.getState().session;
  if (s) {
    const r = await withTimeout(convex.action(api.sketch.detail, { code: s.code, token: s.token, plan: merged, words: text, persist: false }), 18_000, null);
    if (r?.plan) fresh = validatePlan(r.plan, shared.title).objects.filter((o) => !known.some((k) => k.id === o.id));
  }
  // Offline (or no budget): only what these words name, and nothing of the same kind already there.
  if (!fresh.length) fresh = planOffline(text, shared.title, { seeds: false }).objects.filter((o) => !known.some((k) => k.kind === o.kind));
  // Still nothing: a thing the library doesn't know by that name, recognised from Apify's public references ("a daisy").
  if (!fresh.length) fresh = recogniseNamed(text).filter((o) => !known.some((k) => k.kind === o.kind));
  fresh = fresh.slice(0, 3);
  if (!fresh.length) return [];
  const rename = new Map<string, string>();
  fresh = fresh.map((o) => { const id = `${p.key}-${short()}`; rename.set(o.id, id); return { ...o, id, quote: o.quote ?? text.slice(0, 200) }; })
    .map((o) => (o.target && rename.has(o.target) ? { ...o, target: rename.get(o.target)! } : o));
  fresh = shapeNamed(text, fresh, () => true); // shaped by what the references say it looks like
  // Where layout puts them among everything already there, nudged off anything standing on the floor.
  const laid = layout({ ...shared, objects: [...merged.objects, ...fresh] });
  const taken: Placement[] = [...memoryPlacements.current.values(), ...mine.map((o) => o.placement)];
  const added: { data: PlanObject; place: Placement }[] = [];
  for (const o of fresh) {
    const q = { ...(laid.find((l) => l.id === o.id) ?? { id: o.id, x: 0, y: 0, z: 0.4, yaw: 0, scale: o.scale, on: null }) };
    if (q.on && !known.some((k) => k.id === q.on) && !fresh.some((f) => f.id === q.on)) q.on = null;
    for (let i = 0; i < 24; i++) {
      if (!taken.some((t) => t.on === null && q.on === null && Math.hypot(t.x - q.x, t.z - q.z) < 0.55)) break;
      q.x += Math.cos(i * 2.4) * 0.25; q.z += Math.sin(i * 2.4) * 0.2;
    }
    taken.push(q);
    try {
      await socialLink.request({ type: 'object', perspectiveId: p.id, memoryId: memoryKey(), storyId: storyId ?? '', object: o, placement: q });
      added.push({ data: o, place: q });
    } catch (e) { notify((e as Error).message); break; }
  }
  return added;
}
