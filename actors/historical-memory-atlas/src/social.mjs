/** Pure normalization, shared with the application. No cookies, profiles or private URLs. */
export function postUrls(input) {
  if (!Array.isArray(input) || !input.length || input.length > 3) throw new Error('Choose one to three public Instagram photo post URLs.');
  return [...new Set(input.map(value => {
    let u; try { u = new URL(value); } catch { throw new Error('Use a complete Instagram post URL.'); }
    if (u.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(u.hostname) || u.port || u.username || u.password || !/^\/p\/[A-Za-z0-9_-]{4,40}\/?$/.test(u.pathname)) throw new Error('Only public instagram.com/p/ photo posts are supported.');
    return `https://www.instagram.com${u.pathname.replace(/\/$/, '')}/`;
  }))];
}
export function mediaUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password && ['cdninstagram.com', 'fbcdn.net'].some(h => u.hostname.endsWith('.' + h)) ? u.href : null;
  } catch { return null; }
}
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
export function suggestObjects(caption) {
  const hints = [];
  if (/\bkites?\b/i.test(caption)) hints.push('kite');
  if (/\b(flowers?|roses?|dais(?:y|ies)|garden|sunflowers?)\b/i.test(caption)) hints.push('flower');
  if (/\b(landmark|bridge|pier|park|beach|tower|home|village)\b/i.test(caption)) hints.push('landmark');
  return hints;
}
export function normalizePosts(rows, requested) {
  const allowed = new Set(postUrls(requested)), cards = [], seen = new Set();
  if (!Array.isArray(rows)) throw new Error('The scraper returned no post list.');
  for (const row of rows.slice(0, 12)) {
    let sourceUrl; try { sourceUrl = postUrls([row.url ?? row.sourceUrl])[0]; } catch { continue; }
    if (!allowed.has(sourceUrl) || row.error) continue;
    const caption = text(row.caption, 2200), owner = text(row.ownerUsername ?? row.owner, 80) || 'Public post author';
    const timestamp = typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp)) ? new Date(row.timestamp).toISOString() : null;
    // Custom Actor output is normalized again at the application boundary.
    const candidates = row.imageUrl ? [row.imageUrl] : row.type === 'Video' ? [] : Array.isArray(row.childPosts) && row.childPosts.length
      ? row.childPosts.filter(c => c.type !== 'Video').map(c => c.displayUrl)
      : Array.isArray(row.images) && row.images.length ? row.images : [row.displayUrl];
    for (const candidate of candidates) {
      const imageUrl = mediaUrl(candidate), key = sourceUrl + '|' + imageUrl;
      if (!imageUrl || seen.has(key)) continue;
      seen.add(key); cards.push({ sourceUrl, imageUrl, caption, owner, timestamp, suggestedObjects: suggestObjects(caption),
        attribution: 'Public Instagram post; family permission and review required. Caption tags are suggestions, not visual recognition.' });
      if (cards.length === 8) return cards;
    }
  }
  return cards;
}
export function scraperInput(urls) { return { directUrls: postUrls(urls), resultsType: 'posts', resultsLimit: 3, addParentData: false }; }

/** A custom Actor that orchestrates the official scraper and emits memory-ready source cards. */
export async function collectSocial(input, client, onRun = async () => {}) {
  const urls = postUrls(input.postUrls);
  if (input.permissionConfirmed !== true) throw new Error('Confirm permission to use these public posts.');
  const run = await client.actor('apify/instagram-scraper').start(scraperInput(urls), { timeout: 120, maxTotalChargeUsd: .05 });
  await onRun(run.id); // Keep the child run ID before waiting; never silently start a replacement.
  const done = await client.run(run.id).waitForFinish({ waitSecs: 130 });
  if (done.status !== 'SUCCEEDED') throw new Error('The Instagram source run did not complete. Inspect the saved child run before retrying.');
  const { items } = await client.dataset(done.defaultDatasetId).listItems({ limit: 12, clean: true });
  return { schema: 'memory-gate.memory-sources/1', references: normalizePosts(items, urls), childRunId: run.id,
    note: 'Source photos support conversation. They do not establish a remembered event or generate geometry.' };
}
