// Moments: pictures of the place taken at the beats that matter, each with the words that made it. They become the
// album when you leave. Kept on this device immediately (so the album never waits on a network) and saved to the
// session in the background when there is one.
import { create } from 'zustand';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { AlbumMemory, AlbumMoment } from '../album/types';
import { convex, uploadFile } from '../backend/client';
import { useGate } from '../state/store';
import { useMemory } from './memory';

type Snapshot = (opts?: { width?: number }) => Promise<Blob | null>;
let takeSnapshot: Snapshot = async () => null;
/** Installed by <Snapshotter/> inside the canvas. */
export function registerSnapshot(fn: Snapshot) { takeSnapshot = fn; }

type MomentsState = { memories: AlbumMemory[] };
export const useMoments = create<MomentsState>(() => ({ memories: [] }));

let memorySeq = 0;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

class Moments {
  private currentId: string | null = null;

  private current(): AlbumMemory {
    const st = useMoments.getState();
    const plan = useMemory.getState().plan;
    const g = useGate.getState();
    let m = st.memories.find((x) => x.id === this.currentId);
    if (!m) {
      this.currentId = `mem-${++memorySeq}-${newId()}`;
      const place = useMemory.getState().place;
      m = { id: this.currentId, title: plan?.title ?? g.memoryTitle ?? 'A remembered place', at: Date.now(), source: g.media?.kind ?? 'words', palette: plan?.setting.palette ?? [], moments: [], ...(plan ? { plan } : {}), ...(place ? { place } : {}) };
      useMoments.setState({ memories: [m, ...st.memories] });
    }
    return m;
  }

  private update(fn: (m: AlbumMemory) => AlbumMemory) {
    const id = this.currentId;
    useMoments.setState((st) => ({ memories: st.memories.map((m) => (m.id === id ? fn(m) : m)) }));
  }

  /** Capture a moment now. `arrival` marks the first look at the place. */
  async mark(caption: string, audioFileId: string | null, arrival = false): Promise<void> {
    if (useMemory.getState().shared) return; // someone else's shared memory: nothing of it goes in your album
    const mem = this.current();
    const blob = await takeSnapshot({ width: 1280 });
    const imageUrl = blob ? URL.createObjectURL(blob) : null;
    const g = useGate.getState();
    const plan = useMemory.getState().plan;
    const moment: AlbumMoment = {
      id: newId(), memoryId: mem.id, memoryTitle: plan?.title ?? mem.title, caption: caption.trim(), speaker: arrival ? 'companion' : 'you',
      at: Date.now(), imageUrl, sourceUrl: useMemory.getState().photoUrl, audioUrl: null, kind: arrival ? 'arrival' : 'detail',
    };
    this.update((m) => ({ ...m, title: plan?.title ?? m.title, palette: plan?.setting.palette ?? m.palette, moments: [...m.moments, moment], ...(plan ? { plan } : {}) }));
    // Save to the session (picture + words + the original clip id) without holding anything up.
    const s = g.session;
    if (s) void (async () => {
      try {
        let imageFileId: string | null = null;
        if (blob) imageFileId = await uploadFile(await convex.mutation(api.moments.uploadUrl, { code: s.code, token: s.token }), blob);
        await convex.mutation(api.moments.add, {
          code: s.code, token: s.token, memoryTitle: moment.memoryTitle, caption: moment.caption, speaker: moment.speaker, kind: moment.kind,
          ...(imageFileId ? { imageFileId: imageFileId as Id<'_storage'> } : {}), ...(audioFileId ? { audioFileId: audioFileId as Id<'_storage'> } : {}),
        });
      } catch (e) { console.warn('[moments] not saved to the session', e); }
    })();
  }

  /** The last look before leaving. `fallback` names the picture when the place has no first words of its own. */
  /** `intro`: the place's first words in the conversation's language, when they aren't the plan's (a prepared place
   *  visited in Spanish or French). */
  async captureFinal(title: string | null, fallback: string, intro?: string): Promise<void> {
    if (title) this.update((m) => ({ ...m, title }));
    const last = useMoments.getState().memories.find((m) => m.id === this.currentId)?.moments.at(-1);
    if (last && Date.now() - last.at < 4000) return; // a moment was just taken
    await this.mark(intro ?? useMemory.getState().plan?.intro ?? fallback, null, false).then(() =>
      this.update((m) => ({ ...m, moments: m.moments.map((x, i, all) => (i === all.length - 1 ? { ...x, kind: 'final', speaker: 'companion' } : x)) })));
  }

  /** A new visit starts a new memory in the album. */
  reset() { this.currentId = null; }
  /** Returning to a memory from the album adds new moments to it. */
  resume(memoryId: string) { this.currentId = memoryId; }
}

export const moments = new Moments();
