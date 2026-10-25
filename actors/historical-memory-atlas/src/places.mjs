/** Bounded place discovery. A map result is a reference, never a person's memory. */
export function placeQuery(value) {
  if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > 120 || /[\x00-\x1f]/.test(value)) throw new Error('Use a public place or landmark name, 3–120 characters.');
  return value.trim();
}
export function mapsUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['www.google.com', 'google.com', 'maps.google.com'].includes(u.hostname) && /^\/maps(?:\/|$)/.test(u.pathname) ? u.href : null; } catch { return null; }
}
export function placeInput(query) {
  return { searchStringsArray: [placeQuery(query)], maxCrawledPlacesPerSearch: 3, maxImages: 0, maxReviews: 0, language: 'en', scrapeContacts: false, scrapeDirectories: false, scrapeReviewsPersonalData: false };
}
export function normalizePlaces(rows) {
  const out = [], seen = new Set();
  if (!Array.isArray(rows)) throw new Error('The place search returned no list.');
  for (const row of rows.slice(0, 10)) {
    const url = mapsUrl(row.url ?? row.sourceUrl), title = typeof row.title === 'string' ? row.title.trim().slice(0, 120) : '';
    if (!url || !title || row.error || seen.has(url)) continue;
    const lat = row.location?.lat ?? row.lat, lng = row.location?.lng ?? row.lng;
    out.push({ title, sourceUrl: url, address: typeof row.address === 'string' ? row.address.slice(0, 220) : '',
      lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null, lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null });
    seen.add(url); if (out.length === 3) break;
  }
  return out;
}
export async function collectPlaces(input, client, onRun = async () => {}) {
  const query = placeQuery(input.query);
  const run = await client.actor('compass/crawler-google-places').start(placeInput(query), { timeout: 150, maxTotalChargeUsd: .10 });
  await onRun(run.id);
  const done = await client.run(run.id).waitForFinish({ waitSecs: 160 });
  if (done.status !== 'SUCCEEDED') throw new Error('The map search did not finish. Inspect the saved child run before retrying.');
  const { items } = await client.dataset(done.defaultDatasetId).listItems({ limit: 10, clean: true });
  return { schema: 'memory-gate.places/1', query, references: normalizePlaces(items), childRunId: run.id,
    note: 'Review the place before use. Map photos are linked at their source; image-to-3D requires a separately approved family photo.' };
}
