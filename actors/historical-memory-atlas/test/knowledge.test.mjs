import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_TOPICS, topicForKind, collectObjectKnowledge, extractObjectReference, normalizeObjectReferences, wikiExcerpt, wordsAllowed } from '../src/knowledge.mjs';
test('object context uses fixed public topics, never private words, arbitrary URLs, or inferred species', () => {
  assert.equal(topicForKind('kite'), 'kite'); assert.equal(topicForKind('flowers'), 'flowers'); assert.equal(topicForKind('tree'), 'trees'); assert.equal(topicForKind('spool'), 'kite'); assert.equal(topicForKind('radio'), 'radio'); assert.equal(topicForKind('grandma'), null); assert.equal(topicForKind('__proto__'), null);
  assert.throws(() => extractObjectReference('', 'private story', {}));
  assert.throws(() => extractObjectReference('', 'kite', { url: 'http://localhost/admin' }));
  assert.match(OBJECT_TOPICS.flowers.context, /does not identify a species/);
});
test('extracts a brief relevant quotation, skips scripts/navigation, limits source text and validates provenance twice', () => {
  const html = '<nav><p>Kite shop wind wind wind wind wind buy today buy today buy today buy today.</p></nav><script><p>wind wind wind</p></script><p>Wind moves over a kite and makes lift. The kite also experiences drag and weight, while its string holds it in place in the moving air.</p>';
  const r = extractObjectReference(html, 'kite', OBJECT_TOPICS.kite.sources[0], 1234);
  assert.match(r.excerpt, /kite/); assert.doesNotMatch(r.excerpt, /shop|buy/); assert.ok(r.excerpt.split(' ').length <= wordsAllowed(OBJECT_TOPICS.kite.sources[0])); assert.equal(r.fetchedAt, 1234);
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
  assert.ok(calls.some(c => c.url === OBJECT_TOPICS.kite.sources[0].url)); assert.ok(calls.every(c => c.options.redirect === 'error'));
  assert.ok(calls.every(c => /^https:\/\/(www1\.grc\.nasa\.gov|en\.wikipedia\.org|www\.loc\.gov)\//.test(String(c.url)) && !String(c.url).includes('private')));
  assert.equal(r.references.length, 1);
  await assert.rejects(collectObjectKnowledge({ topicKey: 'kite' }, async () => new Response('large',{headers:{'content-type':'text/html','content-length':'2000001'}})), /unavailable/);
});
test('Wikipedia leads become short plain passages; disambiguation pages and stubs are dropped', () => {
  const src = OBJECT_TOPICS.kite.sources.find(s => s.wiki);
  assert.equal(wikiExcerpt('A kite (/kaɪt/) is a tethered craft with wings. It flies on wind.', src), 'A kite is a tethered craft with wings. It flies on wind.');
  assert.equal(wikiExcerpt('Kite may refer to: a bird, a toy', src), null);
  assert.match(wikiExcerpt('A waste container is a type of container intended to store waste. Garbage may refer to food waste specifically.', src), /^A waste container/);
  assert.equal(wikiExcerpt('Short.', src), null);
  assert.ok(wikiExcerpt('One two three four five six seven eight nine ten. '.repeat(12), src).split(' ').length <= 61);
});
test('every topic names fixed sources; photos keep only Library of Congress records and images', () => {
  for (const [key, topic] of Object.entries(OBJECT_TOPICS)) {
    assert.ok(topic.sources.length >= 1 && topic.heading && topic.label, key);
    for (const s of topic.sources) assert.match(s.url, /^https:\/\//);
  }
  const photo = { topicKey: 'kite', kind: 'photo', sourceUrl: 'https://www.loc.gov/item/2017780000/', imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/fsac/1a34257v.jpg#h=725&w=1024', title: 'Boys flying a kite', date: '1939', excerpt: 'Boys flying a kite' };
  const text = { topicKey: 'kite', sourceUrl: OBJECT_TOPICS.kite.sources[1].url, excerpt: 'A kite is a tethered heavier-than-air craft with wing surfaces that react against the air.' };
  const out = normalizeObjectReferences([text, photo, { ...photo, imageUrl: 'https://evil.test/x.jpg', sourceUrl: 'https://www.loc.gov/item/2/' }, { ...photo, sourceUrl: 'https://evil.test/item' }, { ...photo, title: '<img src=x>' }], 'kite');
  assert.deepEqual(out.map(r => r.kind), ['text', 'photo']); assert.equal(out[1].attribution, 'Library of Congress');
});
test('a batch reads Wikipedia twenty articles at a time and keeps going when one source fails', async () => {
  const calls = [];
  const r = await collectObjectKnowledge({ topicKeys: ['radio', 'chair', 'oak'] }, async (url) => {
    calls.push(String(url));
    if (String(url).startsWith('https://en.wikipedia.org/w/api.php')) {
      const titles = new URL(url).searchParams.get('titles').split('|');
      return Response.json({ query: { pages: titles.map(t => ({ title: t.replace(/_/g, ' '), extract: `${t.replace(/_/g, ' ')} is a thing that people have used for a very long time, at home and outdoors.` })) } });
    }
    return new Response('busy', { status: 429 });
  }, { pause: 0 });
  assert.equal(calls.filter(u => u.includes('wikipedia')).length, 1);
  assert.deepEqual([...new Set(r.references.map(x => x.topicKey))].sort(), ['chair', 'oak', 'radio']);
  assert.equal(calls.filter(u => u.includes('loc.gov')).length, 1, 'one rate-limited archive search stops the rest');
});
