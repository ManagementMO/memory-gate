import { expect, test } from 'vitest';
import { asksToEnter, asksToGoIn, asksToLeave, guideOffline, perspectiveFromWords, saysYes, type GuideInput } from '../../packages/shared/src/guide';
import { bringIn, placeFor, placePlan, PLACES } from '../../packages/shared/src/places';
import { COLORS } from '../../packages/shared/src/scene';

const gathering: GuideInput = { phase: 'gathering', transcript: '', history: [], media: null, mediaCaption: null, place: null, invitedToEnter: false, turnsInPhase: 1 };

test.each(['Yes.', 'Yes!', "yeah let's go", "Okay, let's go.", 'Sure', "I'd love that", 'Yes please', 'mhm'])('a plain yes to an invitation steps in: %s', (t) => {
  expect(saysYes(t)).toBe(true);
  expect(guideOffline({ ...gathering, transcript: t, invitedToEnter: true }).intent).toBe('enter');
});

test.each(['No', 'not yet', 'Yes, but not yet', "let's go home", 'Yes, take me home'])('not a yes to stepping in: %s', (t) => {
  expect(saysYes(t)).toBe(false);
});

test('"let\'s go" before the gate means step in once there is a place, and is never goodbye', () => {
  expect(asksToGoIn("let's go")).toBe(true);
  expect(asksToGoIn('take me there')).toBe(true);
  expect(asksToGoIn("let's go home")).toBe(false);
  expect(guideOffline({ ...gathering, transcript: "let's go", turnsInPhase: 2 }).intent).toBe('enter');
  expect(guideOffline({ ...gathering, transcript: "let's go", place: 'The meadow' }).intent).toBe('enter');
  expect(guideOffline({ ...gathering, transcript: "let's go" }).intent).not.toBe('leave');
  // Inside a memory and for real wishes to stop, leaving is unchanged.
  expect(guideOffline({ ...gathering, phase: 'memory', transcript: "let's go" }).intent).toBe('leave');
  expect(guideOffline({ ...gathering, transcript: 'take me home' }).intent).toBe('leave');
  expect(asksToLeave("I'd like to leave")).toBe(true);
});

test.each(['Shall we go and see it?', 'Would you like to see it?', 'Shall I take you there?', 'Ready to step inside?', 'It sounds lovely. Shall we?'])(
  'the companion inviting them in is recognised: %s', (r) => expect(asksToEnter(r)).toBe(true),
);
test.each(['Would you like to tell me more?', 'What do you see there?', 'Gladly. Tell me about a place you’d like to visit.'])(
  'a question is not an invitation: %s', (r) => expect(asksToEnter(r)).toBe(false),
);

test('a colour said for the kite is its colour, whenever it is said', () => {
  const p = PLACES['red-kite'];
  const kite = (plan: ReturnType<typeof bringIn>) => plan?.objects.find((o) => o.kind === 'kite')?.color;
  expect(kite(bringIn(p, placePlan(p, 'The hill'), 'there was a red kite'))).toBe(COLORS.red);
  expect(kite(bringIn(p, placePlan(p, 'The hill'), 'a kite, it was red'))).toBe(COLORS.red);
  let plan = bringIn(p, placePlan(p, 'The hill'), 'we had a kite')!;
  expect(kite(plan)).toBeNull();
  plan = bringIn(p, plan, 'it was so green there') ?? plan; // about the place, not the kite
  expect(kite(plan)).toBeNull();
  plan = bringIn(p, plan, 'it was red') ?? plan;
  expect(kite(plan)).toBe(COLORS.red);
  plan = bringIn(p, plan, 'the kite was yellow') ?? plan;
  expect(kite(plan)).toBe(COLORS.yellow);
  expect(plan.objects.filter((o) => o.kind === 'kite')).toHaveLength(1);
});

test.each([
  ['I remember being here with my grandmother.', 'child'],
  ['My grandma and I flew a red kite on this hill.', 'child'],
  ['When I was a little girl we came here every summer.', 'child'],
  ['as a kid I ran down that path', 'child'],
  ['I brought my grandson here to fly his kite.', 'grandparent'],
  ['My grandkids loved this hill.', 'grandparent'],
  ['I was the grandmother, watching them run.', 'grandparent'],
  ['I remember this hill where we flew a red kite.', null],
  ['There were two benches by the path.', null],
])('whose eyes: %s → %s', (t, who) => expect(perspectiveFromWords(t)).toBe(who));

test.each([
  ['Recuerdo este cerro con mi abuela.', 'child'],
  ['Cuando era niña veníamos aquí.', 'child'],
  ['Je me souviens de cette colline avec ma grand-mère.', 'child'],
  ['Traje a mis nietos a volar la cometa.', 'grandparent'],
])('whose eyes, in Spanish and French: %s → %s', (t, who) => expect(perspectiveFromWords(t)).toBe(who));

test.each([
  ['My grandmother’s garden, full of flowers, with a little path and soft grass.', null],
  ['We had a back yard with a big oak and a dirt path.', null],
  ['El jardín de mi abuela tenía flores y un camino.', null],
  ['We flew a kite in the field.', 'red-kite'],
  ['There were poppies along the path.', 'red-kite'],
  ['I remember this hill.', 'red-kite'],
  ['A garden on the hill where we flew a red kite.', 'red-kite'],
  ['A courtyard with a pergola.', 'courtyard'],
])('which prepared place the words call up: %s → %s', (t, key) => expect(placeFor(t)?.key ?? null).toBe(key));
