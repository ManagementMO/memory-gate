import test from 'node:test';
import assert from 'node:assert/strict';
import { postUrls, normalizePosts, mediaUrl, collectSocial } from '../src/social.mjs';
const url = 'https://www.instagram.com/p/Kite123/';
test('only explicit HTTPS photo posts are sent; tracking is removed and duplicates collapse', () => {
  assert.deepEqual(postUrls([url + '?igsh=tracking', url]), [url]);
  for (const bad of ['http://instagram.com/p/Kite123/', 'https://instagram.com/ourfamily/', 'https://instagram.com/reel/Kite123/', 'https://instagram.com.evil.test/p/Kite123/', 'https://user:pass@instagram.com/p/Kite123/']) assert.throws(() => postUrls([bad]));
  assert.throws(() => postUrls(Array(4).fill(url)));
});
test('carousel photos retain attribution, ignore video/private/error rows and suggest caption objects', () => {
  const rows = [{ url, caption: 'Kite at the park with flowers', ownerUsername: 'family', timestamp: '2020-05-01', childPosts: [
    { type: 'Image', displayUrl: 'https://scontent.cdninstagram.com/a.jpg' }, { type: 'Video', displayUrl: 'https://scontent.cdninstagram.com/video.jpg' },
  ] }, { url: 'https://instagram.com/p/Other123/', displayUrl: 'https://scontent.cdninstagram.com/b.jpg' }, { url, error: 'private' }];
  const cards = normalizePosts(rows, [url]); assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].suggestedObjects, ['kite', 'flower', 'landmark']); assert.equal(cards[0].owner, 'family'); assert.equal(cards[0].timestamp, '2020-05-01T00:00:00.000Z');
  assert.equal(mediaUrl('https://cdninstagram.com.evil.test/x'), null); assert.equal(mediaUrl('http://127.0.0.1/x'), null);
  assert.equal(normalizePosts(cards, [url]).length, 1, 'custom Actor cards round trip through the same boundary');
});
test('custom Actor persists the child run before waiting and emits source cards from the real SDK contract', async () => {
  const calls = [];
  const client = { actor: id => ({ start: async input => { calls.push(['start', id, input]); return { id: 'child123' }; } }),
    run: id => ({ waitForFinish: async () => { calls.push(['wait', id]); return { status: 'SUCCEEDED', defaultDatasetId: 'dataset' }; } }),
    dataset: () => ({ listItems: async () => ({ items: [{ url, displayUrl: 'https://scontent.cdninstagram.com/kite.jpg' }] }) }) };
  const result = await collectSocial({ postUrls: [url], permissionConfirmed: true }, client, async id => calls.push(['saved', id]));
  assert.equal(result.references.length, 1); assert.deepEqual(calls.map(c => c[0]), ['start', 'saved', 'wait']);
  assert.deepEqual(calls[0][2].directUrls, [url]);
});
