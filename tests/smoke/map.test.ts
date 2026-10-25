// The memory map (apps/gate/src/map): pins land where the places are, only San Francisco opens from here, a
// public/private choice made just after a visit survives the reload, and New York's clouded memories carry no words.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { AlbumMemory } from '../../apps/gate/src/album/types';
import { LAND, MAP } from '../../apps/gate/src/map/land';
import { toMap } from '../../apps/gate/src/map/project';
import { HERE, isOpen, PLACES, visibilityKey } from '../../apps/gate/src/map/state';
import { clouded, publicMine, sampleAlbums, SF_SAMPLE_COUNT } from '../../apps/gate/src/map/world';

const memory = (id: string, title: string, captions: string[] = ['There was a bench by the wall.']): AlbumMemory => ({
  id, title, at: 0, source: 'words', palette: [],
  moments: captions.map((caption, i) => ({ id: `${id}-${i}`, memoryId: id, memoryTitle: title, caption, speaker: 'you', at: i, imageUrl: `/img/${id}-${i}.jpg`, sourceUrl: null, audioUrl: null, kind: 'detail' })),
});

test('pins sit where San Francisco and New York are, on the same frame as the land', () => {
  const sf = toMap(PLACES.sf.lat, PLACES.sf.lng), ny = toMap(PLACES.ny.lat, PLACES.ny.lng);
  for (const p of [sf, ny]) for (const v of [p.x, p.y]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(100); }
  expect(sf.x).toBeLessThan(ny.x); // west of
  expect(Math.abs(sf.y - ny.y)).toBeLessThan(3); // about the same latitude
  expect(toMap(MAP.north, -180)).toEqual({ x: 0, y: 0 });
  expect(toMap(MAP.south, 180)).toEqual({ x: 100, y: 100 });
  expect(LAND.startsWith('M')).toBe(true);
  expect(MAP.height).toBeCloseTo(((MAP.north - MAP.south) / 360) * MAP.width, 0);
});

test('only where you are opens: San Francisco, not New York', () => {
  expect(HERE).toBe('sf');
  expect(isOpen('sf')).toBe(true);
  expect(isOpen('ny')).toBe(false);
});

test('a memory keeps its public/private choice from the visit to the reload', () => {
  const during = memory('mem-1-abc', 'The Red Kite meadow');
  const after = memory('K7Q2PX:The Red Kite meadow', 'The Red Kite meadow');
  expect(visibilityKey(during, 'K7Q2PX')).toBe(visibilityKey(after, 'K7Q2PX'));
  expect(visibilityKey(after, 'OTHER1')).toBe(after.id); // remote ids are already the key
  expect(visibilityKey(during, null)).toBe(during.id); // offline: this visit only
  expect(visibilityKey(memory('mem-2', 'x'.repeat(80)), 'K7Q2PX')).toBe(`K7Q2PX:${'x'.repeat(60)}`); // the backend keeps 60
});

test('World memories shows only what was made public, under "You"', () => {
  const a = memory('a', 'Lake'), b = memory('b', 'Kitchen');
  expect(publicMine([a, b], () => false)).toBeNull();
  const mine = publicMine([a, b], (m) => m.id === 'b');
  expect(mine?.owner).toBe('You');
  expect(mine?.memories.map((m) => m.id)).toEqual(['b']);
});

test('the fictional San Francisco albums are labelled samples, each owned by someone', () => {
  const samples = ['sample-lake', 'sample-kitchen', 'sample-garden'].map((id) => memory(id, id));
  const albums = sampleAlbums(samples);
  expect(albums).toHaveLength(SF_SAMPLE_COUNT);
  for (const a of albums) {
    expect(a.sample).toBe(true);
    expect(a.owner).not.toBe('You');
    expect(a.memories.every((m) => m.sample && m.id.startsWith('world:') && m.moments.every((x) => x.memoryTitle === m.title))).toBe(true);
  }
});

test('New York\'s clouded memories are a picture and nothing else', () => {
  const items = clouded([memory('a', 'Secret title', ['A private sentence.', 'Another.'])], 4);
  expect(items).toHaveLength(4);
  for (const c of items) expect(Object.keys(c).sort()).toEqual(['id', 'imageUrl']);
  expect(JSON.stringify(items)).not.toMatch(/Secret|private sentence/);
  // and the page that shows them renders no title, caption or name from them
  const page = readFileSync(new URL('../../apps/gate/src/map/LockedPlace.tsx', import.meta.url), 'utf8');
  expect(page).not.toMatch(/caption|memoryTitle|owner/);
});
