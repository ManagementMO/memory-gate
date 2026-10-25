// The Red Kite meadow is the grandmother's childhood: inside it the two perspectives are her as a girl and the friend
// she flew the kite with (apps/gate/src/social/store.ts MEADOW_CAST, avatar/people.ts MEADOW_PEOPLE).
import { existsSync } from 'node:fs';
import { expect, test } from 'vitest';
import { MEADOW_CAST, useSocial } from '../../apps/gate/src/social/store';
import { MEADOW_PEOPLE, PEOPLE, personFor } from '../../apps/gate/src/social/avatar/people';

test('in the meadow the grandparent is young grandma (the girl) and the grandchild is her friend (the boy)', () => {
  expect(personFor('grandparent', 'meadow').url).toBe('/people/girl.glb');
  expect(personFor('child', 'meadow')).toBe(PEOPLE.child);
  expect(personFor('grandparent', 'family')).toBe(PEOPLE.grandparent);
  for (const p of Object.values(MEADOW_PEOPLE)) expect(existsSync(new URL(`../../apps/gate/public${p.url}`, import.meta.url))).toBe(true);
  // Each perspective sees from its own person's eyes (about 92% of their height).
  expect(MEADOW_CAST.grandparent.eyeHeight).toBeCloseTo(MEADOW_PEOPLE.grandparent.height * 0.924, 1);
  expect(MEADOW_CAST.child.eyeHeight).toBeCloseTo(MEADOW_PEOPLE.child.height * 0.924, 1);
});

test('the room keeps its perspectives (and who claimed them); only who they are changes with the memory', () => {
  const before = useSocial.getState().perspectives.map((p) => p.id);
  useSocial.getState().setCast('meadow');
  expect(useSocial.getState().perspectives.map((p) => [p.key, p.label])).toEqual([['grandparent', 'Young grandma'], ['child', 'Friend']]);
  expect(useSocial.getState().perspectives.map((p) => p.id)).toEqual(before);
  useSocial.getState().setCast('family');
  expect(useSocial.getState().perspectives.map((p) => p.label)).toEqual(['Grandparent', 'Grandchild']);
});
