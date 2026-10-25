/** Public object context, never evidence of a personal memory. No caller-supplied URLs or family words. */
export const OBJECT_TOPICS = Object.freeze({
  kite: { label: 'Kite', heading: 'What keeps a kite in the air?', context: 'About kites', match: /\b(lift|wind|air|force)\b/gi,
    sources: [{ url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/four-forces-on-a-kite/', attribution: 'NASA Glenn Research Center', title: 'Four Forces on a Kite' }] },
  flowers: { label: 'Flowers', heading: 'A little about daisies', context: 'Daisies are one flower example; this scene does not identify a species.', match: /\b(daisy|daisies|flower|petal|yellow|white)\b/gi,
    sources: [{ url: 'https://www.rhs.org.uk/plants/94326/bellis-perennis/details', attribution: 'Royal Horticultural Society', title: 'Bellis perennis · common daisy' }] },
  trees: { label: 'Tree', heading: 'How does a tree work?', context: 'About trees generally; species not identified.', match: /\b(tree|leaves|trunk|roots|water|crown)\b/gi,
    sources: [{ url: 'https://www.dnr.state.mn.us/forestry/education/foresttreasures/partsofatree.html', attribution: 'Minnesota Department of Natural Resources', title: 'Parts of a tree' }] },
});
export function objectTopic(key) {
  if (typeof key !== 'string' || !Object.hasOwn(OBJECT_TOPICS, key)) throw new Error('Choose a supported object topic.');
  return OBJECT_TOPICS[key];
}
export function topicForKind(kind) {
  return kind === 'kite' || kind === 'spool' ? 'kite' : ['flowers', 'vase_flowers', 'flower'].includes(kind) ? 'flowers' : ['tree', 'pine_tree', 'palm_tree'].includes(kind) ? 'trees' : null;
}
const plain = value => value.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|apos|lt|gt|#0*39|#0*34|#x27);/gi, e => ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#34;': '"', '&#x27;': "'" }[e.toLowerCase()] ?? ' ')).replace(/\s+/g, ' ').trim();
export function extractObjectReference(html, topicKey, source, now = Date.now()) {
  const topic = objectTopic(topicKey);
  if (!topic.sources.some(s => s.url === source.url)) throw new Error('Unapproved public reference.');
  const clean = html.replace(/<(script|style|nav|header|footer|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const candidates = [...clean.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => plain(m[2])).filter(t => t.length > 65 && t.length < 2000 && !/cookie|privacy policy|sign up|newsletter|copyright|all rights reserved|javascript/i.test(t));
  const score = t => (t.match(topic.match) ?? []).length / Math.sqrt(t.length);
  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates.find(t => score(t) > .10);
  if (!best) throw new Error('No relevant public explanation was found.');
  // A brief attributed quotation, at most 24 words per source. Full reading stays on the publisher's page.
  const words = best.split(/\s+/), excerpt = words.slice(0, 24).join(' ') + (words.length > 24 ? '…' : '');
  return { topicKey, sourceUrl: source.url, title: source.title, attribution: source.attribution, excerpt, fetchedAt: now };
}
export function normalizeObjectReferences(rows, topicKey) {
  const topic = objectTopic(topicKey), seen = new Set(), out = [];
  if (!Array.isArray(rows)) return out;
  for (const row of rows.slice(0, 4)) {
    const source = topic.sources.find(s => s.url === row?.sourceUrl);
    if (!source || row.topicKey !== topicKey || typeof row.excerpt !== 'string' || seen.has(source.url) || /<[^>]+>/.test(row.excerpt)) continue;
    const excerpt = row.excerpt.replace(/\s+/g, ' ').trim().split(' ').slice(0, 24).join(' ').slice(0, 420);
    if (excerpt.length < 30) continue;
    out.push({ topicKey, sourceUrl: source.url, title: source.title, attribution: source.attribution, excerpt, fetchedAt: Number.isFinite(row.fetchedAt) ? row.fetchedAt : Date.now() }); seen.add(source.url);
  }
  return out;
}
export async function collectObjectKnowledge(input, request = fetch) {
  const topic = objectTopic(input.topicKey), references = [];
  for (const source of topic.sources) {
    const response = await request(source.url, { redirect: 'error', headers: { 'User-Agent': 'MemoryGate-SourceAtlas/1.3 (public educational references)', Accept: 'text/html' }, signal: AbortSignal.timeout(18000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || Number(response.headers.get('content-length')) > 2_000_000) throw new Error('The public reference is unavailable.');
    const reader = response.body?.getReader(); if (!reader) throw new Error('No public page returned.');
    const chunks = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); throw new Error('The reference page exceeds the limit.'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    references.push(extractObjectReference(new TextDecoder().decode(bytes), input.topicKey, source));
  }
  return { schema: 'memory-gate.object-context/1', topicKey: input.topicKey, references, note: 'Public context, not a personal recollection or species identification.' };
}
