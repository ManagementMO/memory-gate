// The memory map (apps/gate/src/map): pins land where the places are, only San Francisco opens from here, a
// public/private choice made just after a visit survives the reload, New York's clouded memories carry no words, and
// zoom mode zooms toward your fingers without ever losing the world off the edge.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { AlbumMemory } from '../../apps/gate/src/album/types';
import { LAND, MAP } from '../../apps/gate/src/map/land';
import { toMap, toMapUnits } from '../../apps/gate/src/map/project';
import { HERE, isOpen, PLACES, visibilityKey } from '../../apps/gate/src/map/state';
import { clouded, publicMine, sampleAlbums, SF_SAMPLE_COUNT } from '../../apps/gate/src/map/world';
import { clampView, MAX_ZOOM, panBy, toScreen, toUnits, viewBox, WORLD, zoomAt } from '../../apps/gate/src/map/view';

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

test('zoom mode: the whole world fits at first, and zooming keeps the spot under your fingers in place', () => {
  const phone = { w: 343, h: 640 }, laptop = { w: 1400, h: 760 };
  for (const s of [phone, laptop]) {
    const w = clampView(WORLD, s), b = viewBox(w, s);
    expect(b.w).toBeGreaterThanOrEqual(MAP.width - 1e-6); // nothing cut off
    expect(b.h).toBeGreaterThanOrEqual(MAP.height - 1e-6);
    expect(Math.min(b.w - MAP.width, b.h - MAP.height)).toBeCloseTo(0, 6); // and fitted to one side
    const sf = toMapUnits(PLACES.sf.lat, PLACES.sf.lng);
    const p = toScreen(w, s, sf);
    const z = zoomAt(w, s, 8, p); // close enough that the world is wider and taller than the screen (no edge holds it)
    expect(z.k).toBe(8);
    const after = toScreen(z, s, sf);
    expect(after.x).toBeCloseTo(p.x, 6);
    expect(after.y).toBeCloseTo(p.y, 6);
    expect(toUnits(z, s, toScreen(z, s, sf)).x).toBeCloseTo(sf.x, 6);
  }
});

test('zoom mode stays between the whole world and the closest zoom, and never pans off the edge', () => {
  const s = { w: 1000, h: 600 };
  expect(zoomAt(WORLD, s, 0.2, { x: 500, y: 300 }).k).toBe(1);
  expect(zoomAt(WORLD, s, 99, { x: 500, y: 300 }).k).toBe(MAX_ZOOM);
  const close = zoomAt(WORLD, s, 6, { x: 500, y: 300 });
  const flung = viewBox(panBy(close, s, 1e6, 1e6), s);
  expect(flung.x).toBeCloseTo(0, 6); // stopped at the west edge
  expect(flung.y).toBeCloseTo(0, 6); // and the north edge
  const other = viewBox(panBy(close, s, -1e6, -1e6), s);
  expect(other.x + other.w).toBeCloseTo(MAP.width, 6);
  expect(other.y + other.h).toBeCloseTo(MAP.height, 6);
  expect(panBy(clampView(WORLD, s), s, 300, 0)).toEqual(clampView(WORLD, s)); // the whole world doesn't slide around
});
