// The memory being drawn: the words (and any photo) gathered so far → a plan → a sketch that forms in the white
// space. Planning runs early, in the background, while the person is still talking, so the place is usually ready
// by the time they step through. Claude plans through the backend (cached, budget-guarded); without a backend or
// over budget, the offline keyword planner still draws a faithful, simpler place.
import { create } from 'zustand';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { planOffline, validatePlan, type ScenePlan } from '../../../../packages/shared/src/scene';
import { bringIn, placePlan, PLACES, type PlaceKey, type PreparedPlace } from '../../../../packages/shared/src/places';
import { serverNow, usePresence } from '../presence/presence';
import { convex, uploadFile } from '../backend/client';
import type { MediaItem, Session } from '../state/store';

type MemoryState = {
  plan: ScenePlan | null;
  /** Bumps whenever the plan changes (the renderer diffs objects by id). */
  version: number;
  planning: boolean;
  /** 0..1 how much of the current plan has formed (set by the renderer). */
  formed: number;
  source: 'claude' | 'offline' | null;
  photoUrl: string | null;
  /** A prepared place from the library this memory is visiting (its world, with things brought in by name). */
  place: PlaceKey | null;
  /** Someone else's memory, shared publicly (the San Francisco map): seen through their eyes, without the family's
   *  two perspectives standing in it. */
  shared?: boolean;
};

export const useMemory = create<MemoryState>(() => ({ plan: null, version: 0, planning: false, formed: 0, source: null, photoUrl: null, place: null }));

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch((e) => { console.warn('[memory]', e); return fallback; }), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

class Memory {
  private session: Session | null = null;
  private words: string[] = [];
  private title: string | null = null;
  private memoryId: Id<'memories'> | null = null;
  private planned = '';
  private inflight: Promise<void> | null = null;
  private mediaFileId: string | null = null;
  private mediaKind: 'photo' | 'video' | null = null;
  private sharing: Promise<void> = Promise.resolve();

  attach(session: Session) { this.session = session; }
  setTitle(t: string) {
    this.title = t;
    // A prepared place keeps its plan; only its name follows the conversation.
    if (useMemory.getState().place) { useMemory.setState((st) => (st.plan ? { plan: { ...st.plan, title: t } } : {})); this.sharePlace(); }
  }

  /** A prepared place is never sketched by the backend, so the host keeps it as the visit's memory: guests follow
   *  into it and see each thing brought in (one save at a time, so they all land on the same memory). */
  private sharePlace() {
    const s = this.session;
    if (!s || s.role !== 'host') return;
    this.sharing = this.sharing.then(async () => {
      const st = useMemory.getState();
      if (!st.place || !st.plan) return;
      try { this.memoryId = await convex.mutation(api.memories.share, { code: s.code, token: s.token, plan: st.plan, place: st.place, ...(this.memoryId ? { memoryId: this.memoryId } : {}) }); }
      catch (e) { console.warn('[memory] the place could not be shared with the family', e); }
    });
  }

  /** Step into a prepared place: its plan is its world (nothing sketched); things come in as they're named. */
  usePlace(p: PreparedPlace, title?: string | null) {
    this.planned = this.words.join(' ').trim();
    useMemory.setState((st) => ({ plan: placePlan(p, title ?? this.title), version: st.version + 1, planning: false, formed: 0, source: 'offline', place: p.key }));
    this.sharePlace();
  }

  /** The prepared place couldn't be shown: plan the place from the words instead, as any visit would. */
  leavePlace() {
    this.planned = '';
    useMemory.setState({ place: null });
  }

  /** Things these words name, brought into the prepared place (true when something came). */
  bringIn(text: string): boolean {
    const st = useMemory.getState();
    if (!st.place || !st.plan) return false;
    // A spot pointed at in the last twenty seconds is what "here" and "there" mean.
    const mark = usePresence.getState().myPoint;
    const pointed: [number, number] | null = mark && serverNow() - mark.t < 20_000 ? [mark.at[0]!, mark.at[2]!] : null;
    const next = bringIn(PLACES[st.place], st.plan, text, pointed);
    if (!next) return false;
    useMemory.setState((s) => ({ plan: next, version: s.version + 1 }));
    this.sharePlace();
    return true;
  }
  addWords(text: string, _audio: string | null) { this.words.push(text); }

  /** Plan (or re-plan when new words arrived). Safe to call often; only one request runs at a time. */
  plan(): void {
    if (useMemory.getState().place) return; // a prepared place is never re-planned
    const text = this.words.join(' ').trim();
    if (!text && !this.mediaFileId) return;
    if (text === this.planned && useMemory.getState().plan) return;
    if (this.inflight) { void this.inflight.then(() => this.plan()); return; }
    this.planned = text;
    useMemory.setState({ planning: true });
    this.inflight = (async () => {
      let plan: ScenePlan | null = null;
      let source: 'claude' | 'offline' = 'offline';
      const s = this.session;
      if (s) {
        const r = await withTimeout(
          convex.action(api.sketch.plan, { code: s.code, token: s.token, words: this.words.slice(-12), title: this.title ?? undefined, ...(this.memoryId ? { memoryId: this.memoryId } : {}), ...(this.mediaFileId ? { mediaFileId: this.mediaFileId as Id<'_storage'> } : {}) }),
          22_000, null,
        );
        if (r?.plan) { plan = validatePlan(r.plan, this.title ?? undefined); source = r.source === 'claude' ? 'claude' : 'offline'; this.memoryId = r.memoryId; }
      }
      if (!plan) plan = planOffline(text || 'a quiet room with a window', this.title);
      if (this.title && plan.title !== this.title) plan = { ...plan, title: this.title };
      plan = keepIdentities(useMemory.getState().plan, plan);
      useMemory.setState((st) => ({ plan, version: st.version + 1, planning: false, source }));
    })().finally(() => { this.inflight = null; });
  }

  /** A shared photo or video: upload it, let Claude look at it (a caption and a plan), keep it for the album. */
  async fromMedia(media: MediaItem): Promise<{ caption: string | null; title: string | null } | null> {
    useMemory.setState({ photoUrl: media.poster ?? media.url });
    this.mediaKind = media.kind;
    const s = this.session;
    if (!s || !media.file) return null;
    try {
      const still = media.kind === 'video' ? await dataUrlToBlob(media.poster!) : await downscale(media.file, 1600);
      const url = await convex.mutation(api.memories.uploadUrl, { code: s.code, token: s.token });
      const fileId = await uploadFile(url, still);
      this.mediaFileId = fileId;
      // Ask for the photo in 3D too (SHARP on the GPU worker when it's deployed); it appears when it's ready.
      void convex.mutation(api.splats.addPhoto, { code: s.code, token: s.token, fileId: fileId as Id<'_storage'>, width: media.width, height: media.height, tone: 'muted', credit: 'Shared in the session', builder: 'auto' }).catch((e) => console.warn('[memory] photo to 3D', e));
      // A quick look first (the companion can say what it sees), then the full plan in the background.
      const r = await convex.action(api.sketch.caption, { code: s.code, token: s.token, fileId: fileId as Id<'_storage'>, kind: media.kind });
      if (r?.title) this.title = r.title;
      this.planFromPhoto();
      return { caption: r?.caption ?? null, title: r?.title ?? null };
    } catch (e) {
      console.warn('[memory] photo', e);
      return null;
    }
  }

  /** Plan from the shared photo plus whatever has been said (runs while the conversation continues). */
  private planFromPhoto(): void {
    this.planned = '';
    this.plan();
  }

  /** "There was a cat on the chair": add to the place that's already there. */
  addDetail(text: string, _audio: string | null): void {
    this.words.push(text);
    if (useMemory.getState().place) return; // in a prepared place, things come in by name (bringIn)
    const current = useMemory.getState().plan;
    const s = this.session;
    void (async () => {
      let next: ScenePlan | null = null;
      if (s && current) {
        const ask = () => convex.action(api.sketch.detail, { code: s.code, token: s.token, plan: current, words: text, ...(this.memoryId ? { memoryId: this.memoryId } : {}) });
        // A dropped connection (Wi-Fi blip, the server restarting) gets one more try once it's back.
        const r = await withTimeout(ask().catch(async (e) => { if (!/connection lost/i.test(String(e))) throw e; await new Promise((ok) => setTimeout(ok, 1500)); return ask(); }), 18_000, null);
        if (r?.plan) next = validatePlan(r.plan, current.title);
      }
      if (!next && current) {
        // Offline: plan the new words on their own and add whatever new things they mention.
        // Only what these words name (never the setting's default furniture), and nothing already there.
        const named = planOffline(text, current.title, { seeds: false }).objects;
        const extra = named.filter((o) => !current.objects.some((c) => c.kind === o.kind)).slice(0, 2);
        // "Make the bed bigger" / "the table was smaller": resize what's already there.
        // Comparatives only: "a little table" describes, "a smaller table" asks for a change.
        const grow = /\b(bigger|larger|wider|taller|longer)\b/i.test(text) ? 1.35 : /\b(smaller|narrower|shorter)\b/i.test(text) ? 0.75 : 1;
        const resized = current.objects.map((c) => (grow !== 1 && named.some((o) => o.kind === c.kind) ? { ...c, scale: Math.min(1.8, Math.max(0.5, c.scale * grow)) } : c));
        next = { ...current, objects: [...resized, ...extra.map((o, i) => ({ ...o, id: `${o.id}-x${current.objects.length + i}` }))].slice(0, 16) };
      }
      if (next) { next = keepIdentities(current, next); useMemory.setState((st) => ({ plan: next, version: st.version + 1 })); }
    })();
  }

  /** Resolves true once the current plan has (mostly) formed, false on timeout. */
  whenDrawn(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const check = () => {
        const st = useMemory.getState();
        if (st.plan && st.formed >= 0.8) return resolve(true);
        if (performance.now() - t0 > ms) return resolve(false);
        setTimeout(check, 150);
      };
      check();
    });
  }

  introLine(): string | null { return useMemory.getState().plan?.intro ?? null; }
  titleNow(): string | null { return useMemory.getState().plan?.title ?? this.title; }
  wordsSoFar(): string[] { return [...this.words]; }
  get kind() { return this.mediaKind; }
  /** The shared memory's id once the backend has one (perspectives keep their things with it). */
  get id(): string | null { return this.memoryId; }

  /** Take on a memory someone else in the session began (a guest following the host, the host taking a guest's photo),
   *  in the prepared place it is visiting, if it is. */
  adopt(plan: ScenePlan, memoryId: string, photoUrl: string | null, place: PlaceKey | null = null) {
    this.memoryId = memoryId as Id<'memories'>;
    this.title = plan.title;
    this.planned = this.words.join(' ').trim();
    const next = keepIdentities(useMemory.getState().plan, plan);
    useMemory.setState((st) => ({ plan: next, version: st.version + 1, planning: false, source: 'claude', ...(photoUrl ? { photoUrl } : {}), ...(place ? { place } : {}) }));
  }

  /** Bring back a memory exactly as it was drawn (from the album, or a shared one from the map). */
  restore(plan: ScenePlan, place: PlaceKey | null = null, shared = false) {
    this.reset();
    this.title = plan.title;
    useMemory.setState({ plan, version: 1, planning: false, formed: 0, source: 'offline', place, shared });
    this.sharePlace();
  }

  reset() {
    this.words = []; this.title = null; this.memoryId = null; this.planned = ''; this.mediaFileId = null; this.mediaKind = null;
    useMemory.setState({ plan: null, version: 0, planning: false, formed: 0, source: null, photoUrl: null, place: null, shared: false });
  }
}

/**
 * A re-plan should feel like the place growing, not being rebuilt: carry earlier ids over to the same things
 * (same kind, and the same label or colour) so what has already formed stays put.
 */
function keepIdentities(prev: ScenePlan | null, next: ScenePlan): ScenePlan {
  if (!prev) return next;
  const free = [...prev.objects];
  const rename = new Map<string, string>();
  const objects = next.objects.map((o) => {
    const i = free.findIndex((p) => p.kind === o.kind && (p.label === o.label || (p.color && p.color === o.color) || p.kind !== 'custom'));
    if (i < 0) return o;
    const match = free.splice(i, 1)[0]!;
    rename.set(o.id, match.id);
    return { ...o, id: match.id };
  });
  return { ...next, objects: objects.map((o) => (o.target && rename.has(o.target) ? { ...o, target: rename.get(o.target)! } : o)) };
}

async function downscale(file: Blob, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.86));
}
async function dataUrlToBlob(u: string): Promise<Blob> { return (await fetch(u)).blob(); }

export const memory = new Memory();
