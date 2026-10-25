// Seeing through someone's eyes: switching perspectives (instant, on this device first) and claiming one as your own.
// The headset cycles with X and picks from the wrist menu; phones and laptops pick from the perspective chip.
import { api } from '../../../../convex/_generated/api';
import { convex } from '../backend/client';
import { memory, useMemory } from '../flow/memory';
import { useGate } from '../state/store';
import { socialLink } from './link';
import { notify, perspectiveOf, useSocial, type PerspectiveKey } from './store';

const ORDER: PerspectiveKey[] = ['grandparent', 'child'];

/**
 * ?pov=grandma or ?pov=grandchild: the eyes this device sees through from the start of the visit, so each person can be
 * sent their own link (the host's and the one who joins). Also grandparent/grandmother/abuela/young-grandma/girl, and
 * child/grandchild/kid/friend/boy. Null without one: the host starts at the grandparent's, a guest takes the free one.
 */
export const POV_FROM_LINK: PerspectiveKey | null = (() => {
  const v = (new URLSearchParams(location.search).get('pov') ?? '').trim().toLowerCase();
  if (/^(grand ?(ma|mother|pa|father|parent)s?|abuel[ao]|young-?grandma|girl)$/.test(v)) return 'grandparent';
  if (/^(grand ?(child|kid|son|daughter)|child|kid|friend|boy)$/.test(v)) return 'child';
  return null;
})();

export function setViewing(key: PerspectiveKey): void {
  if (useSocial.getState().viewing === key) return;
  useSocial.setState({ viewing: key });
  notify(`Seeing through the ${perspectiveOf(key).label.toLowerCase()}’s eyes`);
}

export function cyclePerspective(): PerspectiveKey {
  const now = useSocial.getState().viewing;
  const next = ORDER[(ORDER.indexOf(now) + 1) % ORDER.length]!;
  setViewing(next);
  return next;
}

/** Claim a perspective as yours (and see through it), with the name others will see. Works offline too, locally. */
export async function claimPerspective(key: PerspectiveKey, name: string | null): Promise<void> {
  useSocial.setState({ viewing: key, chosen: true });
  const s = useGate.getState().session;
  const clean = name?.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (s && clean) await convex.mutation(api.rooms.rename, { code: s.code, token: s.token, displayName: clean }).catch(() => undefined);
  if (!socialLink.live) return;
  const p = perspectiveOf(key);
  try { await socialLink.request({ type: 'claim', perspectiveId: p.id, claim: true }); }
  catch (e) { notify((e as Error).message); }
}

export async function releasePerspective(key: PerspectiveKey): Promise<void> {
  if (!socialLink.live) return;
  await socialLink.request({ type: 'claim', perspectiveId: perspectiveOf(key).id, claim: false }).catch((e: Error) => notify(e.message));
}

/** Which memory perspective things belong to: the shared memory's id, or (before it has one) its title. */
export function memoryKey(): string {
  return memory.id ?? `t:${useMemory.getState().plan?.title ?? ''}`.slice(0, 180);
}

export const inMemory = () => { const st = useGate.getState().stage; return st === 'forming' || st === 'memory' || st === 'leaving'; };

(window as unknown as { __social?: Record<string, unknown> }).__social = {
  ...((window as unknown as { __social?: Record<string, unknown> }).__social ?? {}),
  cycle: cyclePerspective, setViewing, claim: claimPerspective,
};
