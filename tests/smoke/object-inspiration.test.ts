// Apify's public references as inspiration for what people bring into a memory (apps/gate/src/object-info/inspiration.ts),
// and every thing a story can bring having a card with real words (the saved copy, scripts/atlas-snapshot.mjs).
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { inspire, recognise, shaped, sizeSaid } from '../../apps/gate/src/object-info/inspiration';
import { OBJECT_TOPIC_KEYS, topicForKind, type ObjectReference } from '../../actors/historical-memory-atlas/src/knowledge.mjs';
import { COLORS, LIBRARY, planOffline, type PlanObject } from '../../packages/shared/src/scene';
import { bringIn, PLACES } from '../../packages/shared/src/places';

const ref = (topicKey: string, title: string, excerpt: string, attribution = 'Wikipedia'): ObjectReference =>
  ({ topicKey, kind: 'text', sourceUrl: `https://example.test/${encodeURIComponent(title)}`, title, attribution, excerpt, fetchedAt: 1 });
const topics = {
  flowers: [
    ref('flowers', 'Bellis perennis · common daisy', 'An evergreen perennial forming rosettes of dark green leaves, with small, solitary, yellow-centred, pink-tinged, white daisies in late spring and summer', 'Royal Horticultural Society'),
    ref('flowers', 'California poppy', 'Eschscholzia californica, the California poppy, golden poppy or cup of gold, is a species of flowering plant native to the United States and Mexico.'),
  ],
  oak: [ref('oak', 'Valley oak', 'Quercus lobata, commonly called the valley oak, is a deciduous oak endemic to California.'), ref('oak', 'Oak', 'An oak is a hardwood tree or shrub in the genus Quercus.')],
  trees: [ref('trees', 'Tree', 'A tree is a tall plant with a trunk and branches.')],
  kite: [ref('kite', 'Kite line', 'In kiting, a line is the string which connects the kite to the person operating it.')],
  school_desk: [ref('school_desk', 'School desk', 'A desk is a piece of furniture with a flat table-style work surface.')],
};
const named = (words: string): PlanObject[] => { const p = planOffline(words, 'The meadow', { seeds: false }).objects; return p.length ? p : recognise(words, topics); };

test('a thing they name is shaped by what the references say about it: a big daisy comes in white and larger', () => {
  const [daisy] = named('oh and this big daisy flower was there');
  expect(daisy).toMatchObject({ kind: 'flowers', label: 'daisy' }); // recognised from the references, not the library
  const i = inspire('oh and this big daisy flower was there', daisy!, topics)!;
  expect(i).toMatchObject({ label: 'Daisy', color: COLORS.white, scale: 1.45, source: { attribution: 'Royal Horticultural Society' } });
  expect(i.source.excerpt).toMatch(/white daisies/);
  expect(shaped(daisy!, i)).toMatchObject({ label: 'Daisy', color: COLORS.white, scale: 1.45 });
});

test('their own words win, and nothing is named a species they didn\'t say', () => {
  const [poppies] = named('there were orange poppies everywhere');
  expect(inspire('there were orange poppies everywhere', poppies!, topics)).toMatchObject({ label: 'Poppy', color: COLORS.orange });
  expect(inspire('some poppies', named('some poppies')[0]!, topics)).toMatchObject({ color: COLORS.golden }); // "golden poppy"
  const [oak] = named('a big old oak tree');
  expect(inspire('a big old oak tree', oak!, topics)).toMatchObject({ label: 'Oak', source: { title: 'Oak' } });
  expect(inspire('a valley oak by the creek', named('a valley oak by the creek')[0]!, topics)).toMatchObject({ label: 'Valley oak' });
  expect(sizeSaid('a tiny little thing')).toBe(0.7);
});

test('only a thing\'s own name shapes it, and ordinary words never conjure things', () => {
  const [kite] = named('the kite had a long line');
  expect(inspire('the kite had a long line', kite!, topics)?.label ?? 'Kite').toBe('Kite');
  expect(recognise('we walked to school together', topics)).toEqual([]);
  expect(recognise('we stood in line for ice cream', topics)).toEqual([]);
});

test('a daisy said in the meadow comes in at one of its flower spots, shaped', () => {
  const place = PLACES['red-kite'];
  const plan = { version: 1 as const, title: place.title, setting: place.setting, ambience: 'none' as const, objects: [], intro: place.intro };
  const next = bringIn(place, plan, 'oh and this big daisy flower was there', null, recognise('oh and this big daisy flower was there', topics))!;
  expect(next.objects.map((o) => o.kind)).toEqual(['flowers']);
  expect(place.spots.flowers!.length).toBeGreaterThan(0);
});

test('every thing a story can bring has a topic, and the saved copy has real words for every topic', () => {
  for (const kind of Object.keys(LIBRARY)) expect(topicForKind(kind), kind).not.toBeNull();
  const saved = JSON.parse(readFileSync(new URL('../../apps/gate/src/object-info/saved-references.json', import.meta.url), 'utf8'));
  const missing = OBJECT_TOPIC_KEYS.filter((k) => !saved.topics[k]?.some((r: ObjectReference) => r.kind !== 'photo' && r.excerpt.length > 40));
  expect(missing).toEqual([]);
  for (const refs of Object.values(saved.topics) as ObjectReference[][]) for (const r of refs) {
    expect(r.sourceUrl).toMatch(/^https:\/\//);
    if (r.kind === 'photo') expect(r.imageUrl).toMatch(/^https:\/\/tile\.loc\.gov\//);
  }
});
