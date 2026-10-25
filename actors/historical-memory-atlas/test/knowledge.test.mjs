import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_TOPICS, topicForKind, collectObjectKnowledge, extractObjectReference, normalizeObjectReferences } from '../src/knowledge.mjs';
test('object context uses fixed public topics, never private words, arbitrary URLs, or inferred species', () => {
  assert.equal(topicForKind('kite'), 'kite'); assert.equal(topicForKind('flowers'), 'flowers'); assert.equal(topicForKind('tree'), 'trees'); assert.equal(topicForKind('grandma'), null);
  assert.throws(() => extractObjectReference('', 'private story', {}));
  assert.throws(() => extractObjectReference('', 'kite', { url: 'http://localhost/admin' }));
  assert.match(OBJECT_TOPICS.flowers.context, /does not identify a species/);
});
test('extracts a brief relevant quotation, skips scripts/navigation, limits source text and validates provenance twice', () => {
  const html = '<nav><p>Kite shop wind wind wind wind wind buy today buy today buy today buy today.</p></nav><script><p>wind wind wind</p></script><p>Wind moves over a kite and makes lift. The kite also experiences drag and weight, while its string holds it in place in the moving air.</p>';
  const r = extractObjectReference(html, 'kite', OBJECT_TOPICS.kite.sources[0], 1234);
  assert.match(r.excerpt, /kite/); assert.doesNotMatch(r.excerpt, /shop|buy/); assert.ok(r.excerpt.split(' ').length <= 24); assert.equal(r.fetchedAt, 1234);
  assert.equal(normalizeObjectReferences([r, r, { ...r, sourceUrl: 'https://evil.test' }, { ...r, topicKey: 'trees' }], 'kite').length, 1);
});
test('flower context excludes synonym lists and prefers a complete explanatory sentence', () => {
  const html='<p>bairnwort, banwood, benner gowan, bone flower, common gowan, double daisy, ewe gowan, goose flower, daisy, daisy, flower</p><p>The common daisy has pale petals surrounding a yellow centre and grows close to the ground.</p>';
  const r=extractObjectReference(html,'flowers',OBJECT_TOPICS.flowers.sources[0]);
  assert.equal(r.excerpt,'The common daisy has pale petals surrounding a yellow centre and grows close to the ground.');
});
test('fetches only the topic allowlist and refuses redirects, HTML errors and oversized pages', async () => {
  const calls=[];
  const r=await collectObjectKnowledge({ topicKey: 'kite', url: 'http://localhost/private', familyWords: 'private' }, async (url, options) => { calls.push({url,options});return new Response('<p>The moving air creates lift on the kite, while its string anchors it and the wind keeps it aloft in the sky.</p>', {headers:{'content-type':'text/html'}}); });
  assert.equal(calls[0].url, OBJECT_TOPICS.kite.sources[0].url); assert.equal(calls[0].options.redirect, 'error'); assert.equal(r.references.length, 1);
  await assert.rejects(collectObjectKnowledge({ topicKey: 'kite' }, async () => new Response('large',{headers:{'content-type':'text/html','content-length':'2000001'}})), /unavailable/);
});
