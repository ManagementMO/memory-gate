const MAX_BYTES = 3_000_000;
export function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('An archive search input is required.');
  const place = typeof input.place === 'string' ? input.place.trim() : '';
  const terms = typeof input.terms === 'string' ? input.terms.trim() : '';
  if (place.length < 2 || place.length > 100 || terms.length > 100 || /[\x00-\x1f]/.test(place + terms)) throw new Error('Use a public place name (2–100 characters) and short search terms.');
  const { yearFrom, yearTo } = input;
  if (![yearFrom, yearTo].every(y => Number.isInteger(y) && y >= 1000 && y <= 2100) || yearFrom > yearTo) throw new Error('Choose an ordered year range from 1000 to 2100.');
  const maxItems = input.maxItems ?? 4;
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 8) throw new Error('Request between 1 and 8 references.');
  return { place, terms, yearFrom, yearTo, maxItems };
}
export function safeArchiveUrl(value, image = false) {
  try {
    const u = new URL(value);
    const hosts = image ? ['tile.loc.gov', 'www.loc.gov', 'cdn.loc.gov', 'loc.gov'] : ['www.loc.gov', 'loc.gov'];
    // The official API still returns http catalog IDs. Upgrade only allowlisted hosts.
    if (u.protocol === 'http:' && hosts.includes(u.hostname) && !u.port) u.protocol = 'https:';
    return u.protocol === 'https:' && hosts.includes(u.hostname) && !u.username && !u.password && !u.port ? u.href : null;
  } catch { return null; }
}
const plain = (value, max = 1200) => (Array.isArray(value) ? value.join(' · ') : typeof value === 'string' ? value : '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
export function normalizeReference(result, detail, input, retrievedAt) {
  const item = detail?.item ?? result;
  const sourceUrl = safeArchiveUrl(result.id ?? result.url);
  if (!sourceUrl) return null;
  const date = plain(item.date ?? result.date, 120) || 'Date not supplied';
  const years = (date.match(/\b(?:1\d{3}|20\d{2}|2100)\b/g) ?? []).map(Number);
  // Exclude clearly out-of-period items, keep unknown dates visibly uncertain.
  if (years.length && (Math.max(...years) < input.yearFrom || Math.min(...years) > input.yearTo)) return null;
  const rights = plain(item.rights_advisory ?? item.rights_information ?? item.rights ?? detail?.rights) || 'Rights not supplied. Check the institution record before reuse.';
  const imagePermitted = /no known (?:restrictions|copyright restrictions) on publication|public domain/i.test(rights)
    && !/may be restricted|other sources|except|permission required/i.test(rights);
  const images = Array.isArray(result.image_url) ? result.image_url : [];
  const imageUrl = imagePermitted ? images.map(u => safeArchiveUrl(u, true)).filter(Boolean).at(-1) ?? null : null;
  return {
    id: sourceUrl, title: plain(item.title ?? result.title, 240) || 'Untitled archival record',
    sourceUrl, publisher: 'Library of Congress', date,
    description: plain(item.description ?? item.notes ?? result.description), rights, imageUrl,
    dateMatch: years.length ? 'overlaps-requested-period' : 'unknown',
    uncertainty: years.length ? 'Catalog date overlaps the requested period. Search relevance is not proof of this family’s memory.' : 'The catalog does not supply a usable date; the requested period is unverified.',
    retrievedAt, provenance: 'public-archive',
  };
}
async function readJson(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(15_000), redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'HeirloomMemoryAtlas/1.0 (public archival research; github.com/ManagementMO/memory-gate)' } });
  if (!response.ok) throw new Error(`Archive request failed (${response.status}). Try again later.`);
  if (!response.body) throw new Error('Archive returned an empty response.');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > MAX_BYTES) throw new Error('Archive response exceeded the size limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function searchArchive(rawInput, { fetcher = fetch, now = () => new Date().toISOString() } = {}) {
  const input = validateInput(rawInput); const retrievedAt = now();
  const url = new URL('https://www.loc.gov/photos/');
  url.search = new URLSearchParams({ fo: 'json', q: `${input.place} ${input.terms}`.trim(), c: String(Math.min(16, input.maxItems * 2)), at: 'results' }).toString();
  const response = await readJson(url, fetcher);
  if (!Array.isArray(response.results)) throw new Error('Archive returned an unrecognized response.');
  const references = []; const seen = new Set(); const warnings = [];
  // At most nine requests per run. Details provide rights; failed details never imply permission.
  let detailRequests = 0;
  for (const result of response.results.slice(0, 16)) {
    if (references.length >= input.maxItems || detailRequests >= 8) break;
    const sourceUrl = safeArchiveUrl(result.id ?? result.url);
    if (!sourceUrl || seen.has(sourceUrl)) continue; seen.add(sourceUrl);
    if (!normalizeReference(result, null, input, retrievedAt)) continue;
    let detail = null;
    try { detailRequests++; const detailUrl = new URL(sourceUrl); detailUrl.searchParams.set('fo', 'json'); detail = await readJson(detailUrl, fetcher); }
    catch { warnings.push(`Details unavailable for ${sourceUrl}; image reuse is not enabled.`); }
    const ref = normalizeReference(result, detail, input, retrievedAt);
    if (ref) references.push(ref);
  }
  return { input, references, warnings, retrievedAt, source: 'Library of Congress JSON API', searchUrl: url.href, statement: 'Public historical context, not evidence of a personal recollection. No scene is changed automatically.' };
}
