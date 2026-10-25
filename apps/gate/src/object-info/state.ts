import { create } from 'zustand';
import type { ObjectReference, ObjectTopicKey } from '../../../../actors/historical-memory-atlas/src/knowledge.mjs';
import { inspire, recognise, shaped, type Inspiration } from './inspiration';
import type { PlanObject } from '../../../../packages/shared/src/scene';
import { notify } from '../social/store';
export type InfoTarget = { id: string; label: string; topic: ObjectTopicKey; node: string; lift: number; anchor?: [number, number, number] };
export const infoButtons = new Map<string, HTMLButtonElement>();
type Saved = { retrievedAt: string; topics: Record<string, ObjectReference[]> };
export const useObjectInfo = create<{ targets: InfoTarget[]; selected: string | null; busy: boolean; error: string; more: boolean; saved: Saved | null }>(() => ({ targets: [], selected: null, busy: false, error: '', more: false, saved: null }));
export const closeObjectInfo = () => useObjectInfo.setState({ selected: null, busy: false, error: '', more: false });

/** The saved copy of every topic's references (scripts/atlas-snapshot.mjs, retrieved with Apify), fetched the first time
 *  a card opens: what a card shows whenever a live lookup can't run or hasn't finished. */
let loading: Promise<Saved | null> | null = null;
export function loadSaved(): Promise<Saved | null> {
  loading ??= import('./saved-references.json').then((m) => { const saved = m.default as unknown as Saved; useObjectInfo.setState({ saved }); return saved; }).catch(() => { loading = null; return null; });
  return loading;
}

/** What a card shows for a topic: a finished live lookup, else the saved copy. Passages first, then archive photos. */
export function referencesFor(job: { status: string; references: ObjectReference[] } | undefined, topic: ObjectTopicKey, saved: Saved | null): { refs: ObjectReference[]; live: boolean } {
  if (job?.status === 'ready' && job.references.some((r) => r.kind !== 'photo')) return { refs: job.references, live: true };
  return { refs: saved?.topics[topic] ?? [], live: false };
}

// Things shaped by what the references say (inspiration.ts), by object id, for their cards.
export const useInspired = create<{ live: Record<string, ObjectReference[]>; byId: Record<string, Inspiration> }>(() => ({ live: {}, byId: {} }));
/** Every topic's references this device has: the saved copy, with finished live lookups over it. */
export function topicsNow(): Record<string, ObjectReference[]> {
  return { ...(useObjectInfo.getState().saved?.topics ?? {}), ...useInspired.getState().live };
}
/** Things these words name that the scene library missed, recognised from the references ("a daisy"). */
export function recogniseNamed(words: string): PlanObject[] {
  const topics = topicsNow();
  if (!Object.keys(topics).length) { void loadSaved(); return []; }
  return recognise(words, topics);
}
/** New things these words brought, shaped from what the references say about them (and noted for their cards). */
export function shapeNamed(words: string, objects: PlanObject[], isNew: (o: PlanObject) => boolean): PlanObject[] {
  const topics = topicsNow();
  if (!Object.keys(topics).length) { void loadSaved(); return objects; }
  return objects.map((o) => {
    if (!isNew(o)) return o;
    const i = inspire(words, o, topics);
    if (!i) return o;
    useInspired.setState((s) => ({ byId: { ...s.byId, [o.id]: i } }));
    const next = shaped(o, i);
    if (next.color !== o.color || next.scale !== o.scale || next.label.toLowerCase() !== o.label.toLowerCase()) notify(`${i.label} · shaped from ${i.source.attribution}, found with Apify`);
    return next;
  });
}
