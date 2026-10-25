import test from 'node:test';
import assert from 'node:assert/strict';
import { placeQuery, placeInput, normalizePlaces, collectPlaces } from '../src/places.mjs';
test('place lookup is bounded and omits photos, reviews and contact scraping', () => {
  assert.equal(placeQuery(' Golden Gate Park '), 'Golden Gate Park');
  for (const bad of ['', 'ab', 'a'.repeat(121), 'park\nprivate']) assert.throws(() => placeQuery(bad));
  assert.deepEqual(placeInput('Golden Gate Park').searchStringsArray, ['Golden Gate Park']);
  assert.equal(placeInput('Golden Gate Park').maxCrawledPlacesPerSearch, 3);
  assert.equal(placeInput('Golden Gate Park').maxImages, 0); assert.equal(placeInput('Golden Gate Park').maxReviews, 0);
});
test('map references retain only bounded public context, deduplicate, and reject foreign URLs', () => {
  const row = { title: 'The park', url: 'https://www.google.com/maps/place/The+park/', address: 'Public park', location: { lat: 37, lng: -122 }, reviews: [{ private: true }] };
  const result = normalizePlaces([row, row, { ...row, url: 'https://evil.test/maps/place/Park/' }]);
  assert.equal(result.length, 1); assert.equal(result[0].lat, 37); assert.equal('reviews' in result[0], false);
  assert.equal(normalizePlaces(result)[0].sourceUrl, row.url);
});
test('custom place Actor records its child run and emits normalized map references', async () => {
  const calls = [];
  const client = { actor: id => ({ start: async (input, options) => { calls.push([id, input, options]); return { id: 'mapsChild' }; } }),
    run: () => ({ waitForFinish: async () => ({ status: 'SUCCEEDED', defaultDatasetId: 'mapData' }) }),
    dataset: () => ({ listItems: async () => ({ items: [{ title: 'Park', url: 'https://www.google.com/maps/place/Park/' }] }) }) };
  const result = await collectPlaces({ query: 'Park in town' }, client, async id => calls.push(['saved', id]));
  assert.equal(calls[0][0], 'compass/crawler-google-places'); assert.equal(calls[0][2].maxTotalChargeUsd, .50); assert.equal(calls[1][0], 'saved'); assert.equal(result.references.length, 1);
});
