// Who each perspective is in the memory: the grandchild is a boy of about eight, the grandparent his grandmother.
// Rigged MakeHuman characters (CC0, apps/gate/scripts/prepare-people.mjs), shown at their true size; each
// perspective's eye height is theirs (store.ts PERSONAS), so what you see from matches the body the other person sees.
import type { PerspectiveKey } from '../store';

export type Person = { url: string; label: string; height: number };
export const PEOPLE: Record<PerspectiveKey, Person> = {
  child: { url: '/people/boy.glb', label: 'boy', height: 1.31 },
  grandparent: { url: '/people/grandma.glb', label: 'grandma', height: 1.56 },
};
