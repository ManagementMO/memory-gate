// Where each perspective stands in a memory. Two people were in the room: through the grandparent's eyes you stand
// where the grandparent was and see the grandchild across the room, and the other way round. Until the story says
// where someone was, the two stand on opposite sides of the room facing each other; when a memory says "I sat by the
// stove", that perspective moves beside the stove (Claude reads the words; a plain word match stands in without it).
// Spots are relative to the memory's centre and kept per memory in the exchange, so every device agrees.
import { api } from '../../../../convex/_generated/api';
import { entryOf, LIBRARY, ROOM, type Placement } from '../../../../packages/shared/src/scene';
import { convex } from '../backend/client';
import { useMemory } from '../flow/memory';
import { MEMORY_CENTER } from '../scene/layout';
import { useGate } from '../state/store';
import { socialLink } from './link';
import { memoryPlacements } from './overlay';
import { inMemory, memoryKey } from './perspectives';
import { perspectiveOf, useSocial, type Perspective, type PerspectiveKey } from './store';

export type Point = { x: number; z: number };
type Thing = { id: string; label: string; kind: string; place: Placement };

/** Opposite sides of the room, facing each other: the grandparent near the open front, the grandchild across. */
const DEFAULTS: Record<PerspectiveKey, Point> = { grandparent: { x: -1.5, z: 1.4 }, child: { x: 1.4, z: -0.8 } };
const others: Record<PerspectiveKey, PerspectiveKey> = { grandparent: 'child', child: 'grandparent' };
export const otherKeyOf = (key: PerspectiveKey) => others[key];

/** Everything standing in this memory: the shared plan's things and every perspective's own. */
export function things(): Thing[] {
  const plan = useMemory.getState().plan;
  const mem = memoryKey();
  const shared = (plan?.objects ?? []).flatMap((o) => { const p = memoryPlacements.current.get(o.id); return p ? [{ id: o.id, label: o.label, kind: o.kind, place: p }] : []; });
  const own = useSocial.getState().objects.filter((o) => o.memoryId === mem).map((o) => ({ id: o.data.id, label: o.data.label, kind: o.data.kind, place: o.placement }));
  return [...shared, ...own];
}

const radius = (t: Thing) => { const e = entryOf(t.kind); return (Math.max(e.fp[0], e.fp[1]) * (t.place.scale || 1)) / 2; };
const inside = (p: Point): Point => ({ x: Math.max(-ROOM.width / 2 + 0.5, Math.min(ROOM.width / 2 - 0.5, p.x)), z: Math.max(-ROOM.depth / 2 + 0.5, Math.min(2.4, p.z)) });

/** Step a spot off any furniture standing on the floor (never inside a table). */
function clear(p: Point, items: Thing[]): Point {
  let q = inside(p);
  for (let i = 0; i < 30; i++) {
    const hit = items.find((t) => t.place.on === null && Math.hypot(t.place.x - q.x, t.place.z - q.z) < radius(t) + 0.4);
    if (!hit) break;
    const dx = q.x - hit.place.x, dz = q.z - hit.place.z, d = Math.hypot(dx, dz) || 1;
    q = inside({ x: q.x + (dx / d) * 0.2 + (i % 2 ? 0.05 : -0.05), z: q.z + (dz / d) * 0.2 });
  }
  return q;
}

/** Just beside a thing, on the side facing into the room. */
export function besideThing(objectId: string, items = things()): Point | null {
  const t = items.find((x) => x.id === objectId);
  if (!t) return null;
  const toward = { x: -t.place.x * 0.5, z: 1.2 - t.place.z };
  const d = Math.hypot(toward.x, toward.z) || 1;
  const reach = radius(t) + 0.45;
  return clear({ x: t.place.x + (toward.x / d) * reach, z: t.place.z + (toward.z / d) * reach }, items.filter((x) => x.id !== objectId));
}

/** Where a perspective stands in the memory being visited (relative to its centre). */
export function spotOf(key: PerspectiveKey): Point & { source: 'default' | 'story'; objectId: string } {
  const p = perspectiveOf(key);
  const row = useSocial.getState().spots.find((s) => s.perspectiveId === p.id && s.memoryId === memoryKey());
  if (row) return { x: row.x, z: row.z, source: row.source, objectId: row.objectId };
  return { ...clear(DEFAULTS[key], things()), source: 'default', objectId: '' };
}
export const worldSpot = (key: PerspectiveKey) => { const s = spotOf(key); return { x: MEMORY_CENTER.x + s.x, z: MEMORY_CENTER.z + s.z }; };

/** A camera-style yaw (-Z forward) from one perspective's spot toward the other's. */
export function facingOther(key: PerspectiveKey): number {
  const a = spotOf(key), b = spotOf(otherKeyOf(key));
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

// ---------------------------------------------------------------- from the story
const NEAR = '(?:by|beside|next to|near|at|under|underneath|on|behind|in front of|close to|against|in)';
const DET = '(?:the |my |our |a |an |her |his |their |grandma\'s |grandpa\'s )?';
const SELF = /\b(i|we)\s+(was|were|sat|sit|stood|stand|used to|would|always|played|play|hid|hide|lay|knelt|waited|curled)\b/i;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Without Claude: the first listed thing the words place someone by ("by the stove", "under the table"). */
export function locateInWords(text: string, items: Thing[]): { objectId: string; certain: boolean } | null {
  const t = text.toLowerCase();
  let best: { objectId: string; at: number } | null = null;
  for (const it of items) {
    const names = [it.label, it.kind.replace(/_/g, ' '), ...(LIBRARY[it.kind]?.syn ?? [])].map((n) => n.toLowerCase().trim()).filter((n) => n.length > 2);
    for (const name of new Set(names)) {
      const m = new RegExp(`\\b${NEAR}\\s+${DET}(?:[a-z]+\\s){0,2}?${esc(name)}s?\\b`).exec(t);
      if (m && (!best || m.index < best.at)) best = { objectId: it.id, at: m.index };
    }
  }
  return best ? { objectId: best.objectId, certain: SELF.test(t) } : null;
}

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** A memory told through a perspective's eyes may say where they were: stand them there. */
export async function placeFromStory(text: string, p: Perspective): Promise<void> {
  if (!socialLink.ready || !inMemory()) return;
  const items = things();
  if (!items.length) return;
  const s = useGate.getState().session;
  const byClaude = s ? await withTimeout(convex.action(api.guide.locate, { code: s.code, token: s.token, label: p.label, words: text, objects: items.map((i) => ({ id: i.id, label: i.label })) }), 6000, null) : null;
  const found = byClaude ?? locateInWords(text, items);
  if (!found) return;
  const current = spotOf(p.key);
  // The first place the story gives stays, unless someone clearly says where they themselves were.
  if (current.source === 'story' && !found.certain && current.objectId) return;
  const at = besideThing(found.objectId, items);
  if (!at) return;
  await socialLink.request({ type: 'spot', perspectiveId: p.id, memoryId: memoryKey(), x: at.x, z: at.z, objectId: found.objectId, source: 'story', quote: text.slice(0, 300) }).catch(() => undefined);
}

/** The host keeps the opening places, so every device puts the two perspectives in the same spots. */
export function keepDefaultSpots(): void {
  if (!socialLink.ready || !inMemory() || useGate.getState().session?.role !== 'host') return;
  const mem = memoryKey();
  for (const key of ['grandparent', 'child'] as PerspectiveKey[]) {
    const p = perspectiveOf(key);
    if (useSocial.getState().spots.some((s) => s.perspectiveId === p.id && s.memoryId === mem)) continue;
    const at = spotOf(key);
    void socialLink.request({ type: 'spot', perspectiveId: p.id, memoryId: mem, x: at.x, z: at.z, objectId: '', source: 'default', quote: '' }).catch(() => undefined);
  }
}

(window as unknown as { __social?: Record<string, unknown> }).__social = {
  ...((window as unknown as { __social?: Record<string, unknown> }).__social ?? {}),
  spot: (key: PerspectiveKey) => ({ ...spotOf(key), world: worldSpot(key), facing: facingOther(key) }),
};
