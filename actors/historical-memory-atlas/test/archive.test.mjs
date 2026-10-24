import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, normalizeReference, safeArchiveUrl, searchArchive } from '../src/archive.mjs';
const input = { place: 'San Francisco', yearFrom: 1900, yearTo: 1980, maxItems: 2 };
const row = { id: 'https://www.loc.gov/item/test/', title: 'Test fixture only', date: '1935', image_url: ['https://tile.loc.gov/test.jpg'] };
test('rejects unbounded requests and reversed years', () => {
  for (const change of [{ maxItems: 9 }, { yearFrom: 2000, yearTo: 1900 }, { place: '' }, { yearFrom: '1930' }]) assert.throws(() => validateInput({ ...input, ...change }));
});
test('does not turn missing rights or dates into historical certainty', () => {
  const r = normalizeReference({ ...row, date: undefined }, null, input, 'test');
  assert.equal(r.imageUrl, null); assert.equal(r.dateMatch, 'unknown');
  assert.equal(normalizeReference({ ...row, date: '2020' }, null, input, 'test'), null);
});
test('only displays institution images with explicit rights and retains exact rights', () => {
  const r = normalizeReference(row, { item: { date: '1930-1940', rights_advisory: 'No known restrictions on publication.' } }, input, 'test');
  assert.equal(r.imageUrl, row.image_url[0]); assert.match(r.rights, /No known/);
  for (const url of ['http://www.loc.gov/item/x', 'https://www.loc.gov.evil.test/x', 'https://user@www.loc.gov/x', 'https://127.0.0.1/x', 'javascript:alert(1)']) assert.equal(safeArchiveUrl(url), null);
});
test('bounds requests, deduplicates records, and records retrieval provenance', async () => {
  const calls = [];
  const output = await searchArchive(input, { now: () => '2026-10-24T00:00:00Z', fetcher: async url => {
    calls.push(String(url)); return Response.json(calls.length === 1 ? { results: [row, row, row] } : { item: { rights_advisory: 'Public domain', date: '1935' } });
  } });
  assert.equal(calls.length, 2); assert.equal(output.references.length, 1); assert.equal(output.references[0].provenance, 'public-archive');
});
test('upstream errors remain errors rather than fabricated results', async () => {
  await assert.rejects(searchArchive(input, { fetcher: async () => new Response('', { status: 429 }) }), /429/);
});
