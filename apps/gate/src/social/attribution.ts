// Keeping what is said with the perspective it was said from. The conversation (flow/controller.ts) calls these:
// each turn joins the viewing perspective's thread with the companion, a memory told inside the place becomes that
// perspective's story (spoken by whoever said it), and the companion is given that perspective's context: its own
// thread, a short summary, its stories and archive photographs, and what the other perspective remembers here.
// Everything is a quiet no-op without the exchange: the conversation then works exactly as before.
import { api } from '../../../../convex/_generated/api';
import type { GuidePerspective, GuideTurn } from '../../../../packages/shared/src/guide';
import { convex } from '../backend/client';
import { useGate } from '../state/store';
import { socialLink } from './link';
import { inMemory, memoryKey } from './perspectives';
import { notify, perspectiveById, useSocial, viewingPerspective } from './store';
import { placeFromStory } from './spots';

const uuid = () => crypto.randomUUID();

/** One turn of the conversation, into the viewing perspective's thread (inside the memory only). */
export function turn(who: 'person' | 'companion', text: string): void {
  if (!socialLink.ready || !inMemory() || !text.trim()) return;
  const p = viewingPerspective();
  void socialLink.request({ type: 'turn', commandId: uuid(), perspectiveId: p.id, who, text: text.slice(0, 600) })
    .then(() => { if (who === 'companion') void maybeSummarize(p.id); })
    .catch(() => undefined);
}

/** A memory told from the viewing perspective. Resolves to the story's id once kept (null without the exchange). */
export async function story(text: string, opts: { kind?: 'story' | 'note'; audioFileId?: string | null; objectId?: string | null; at?: number[] | null } = {}): Promise<string | null> {
  const roomId = socialLink.roomId;
  if (!socialLink.ready || !roomId || !text.trim()) return null;
  const commandId = uuid();
  const p = viewingPerspective();
  try {
    await socialLink.request({
      type: 'story', commandId, perspectiveId: p.id, memoryId: memoryKey(), kind: opts.kind ?? 'story', text: text.slice(0, 2000),
      objectId: opts.objectId ?? '', at: opts.at && opts.at.length === 3 ? opts.at : [], audioFileId: opts.audioFileId ?? '',
    });
    void placeFromStory(text, p); // "I sat by the stove": stand this perspective there
    return `${roomId}:${commandId}`;
  } catch (e) {
    notify((e as Error).message);
    return null;
  }
}

/** The companion's view of this perspective (null outside the memory or without the exchange). */
export function guideContext(): { history: GuideTurn[]; perspective: GuidePerspective } | null {
  if (!socialLink.ready || !inMemory()) return null;
  const st = useSocial.getState();
  const p = viewingPerspective();
  const mem = memoryKey();
  const history = st.turns.filter((t) => t.perspectiveId === p.id).slice(-8).map((t) => ({ who: t.who, text: t.text }));
  const here = st.stories.filter((s) => s.memoryId === mem);
  return {
    history,
    perspective: {
      label: p.label,
      eyeHeight: p.eyeHeight,
      viewer: p.claimedName || null,
      summary: st.summaries.find((s) => s.perspectiveId === p.id)?.summary ?? null,
      stories: here.filter((s) => s.perspectiveId === p.id).slice(-4).map((s) => s.text),
      archive: st.pins.filter((x) => x.perspectiveId === p.id).slice(-3).map((x) => ({ title: x.data.title, date: x.data.date })),
      elsewhere: here.filter((s) => s.perspectiveId !== p.id).slice(-3).map((s) => ({ label: perspectiveById(s.perspectiveId)?.label ?? 'Someone', text: s.text })),
    },
  };
}

/** Every ten turns, fold the perspective's thread into a few lines that travel with it. */
const summarizing = new Set<string>();
async function maybeSummarize(perspectiveId: string): Promise<void> {
  const st = useSocial.getState();
  const turns = st.turns.filter((t) => t.perspectiveId === perspectiveId);
  const prior = st.summaries.find((s) => s.perspectiveId === perspectiveId);
  const s = useGate.getState().session;
  // The thread keeps only its latest 40 turns, so count what is new since the last summary.
  const since = prior ? turns.filter((t) => t.createdAt > prior.updatedAt).length : turns.length;
  if (!s || summarizing.has(perspectiveId) || since < 10) return;
  summarizing.add(perspectiveId);
  try {
    const label = perspectiveById(perspectiveId)?.label ?? 'Perspective';
    const summary = await convex.action(api.guide.summarize, { code: s.code, token: s.token, label, previous: prior?.summary, turns: turns.slice(-20).map((t) => ({ who: t.who, text: t.text })) });
    if (summary) await socialLink.request({ type: 'summary', perspectiveId, summary, turnCount: (prior?.turnCount ?? 0) + since });
  } catch { /* the next ten turns try again */ } finally { summarizing.delete(perspectiveId); }
}
