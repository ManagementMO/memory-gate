// Handing a memory across: a story told through one perspective's eyes, offered to the other. It waits there until
// someone seeing through those eyes keeps it (it then becomes theirs too, with whatever it added to the place) or
// says not now. Used by the wrist menu, the story card and the phone's tray.
import { socialLink } from './link';
import { memoryKey } from './perspectives';
import { notify, perspectiveById, useSocial, viewingPerspective, type Handoff } from './store';

export function otherPerspective() {
  const st = useSocial.getState();
  return st.perspectives.find((p) => p.key !== st.viewing) ?? null;
}

export function lastStoryOfViewing() {
  const p = viewingPerspective();
  const mem = memoryKey();
  return [...useSocial.getState().stories].reverse().find((s) => s.perspectiveId === p.id && s.memoryId === mem) ?? null;
}

export async function handOver(storyId: string, toPerspectiveId: string): Promise<void> {
  try {
    await socialLink.request({ type: 'pass-story', storyId, toPerspectiveId });
    notify(`Handed to the ${(perspectiveById(toPerspectiveId)?.label ?? 'other perspective').toLowerCase()}`);
  } catch (e) { notify((e as Error).message); }
}

export async function respondHandoff(h: Handoff, accept: boolean): Promise<void> {
  try {
    await socialLink.request({ type: 'respond-handoff', handoffId: h.id, accept, revision: h.revision });
    if (accept) notify('Kept with this perspective');
  } catch (e) { notify((e as Error).message); }
}
