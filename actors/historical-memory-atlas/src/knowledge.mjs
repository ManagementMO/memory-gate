/** Public object context, never evidence of a personal memory. No caller-supplied URLs or family words: every topic,
 * page, article title and archive search below is fixed here, and a run only names topic keys. */
import { findPhotos, safeArchiveUrl } from './archive.mjs';

const wiki = (title, label = title.replace(/_/g, ' ').replace(/ \(.*\)$/, '')) =>
  ({ url: `https://en.wikipedia.org/wiki/${title}`, wiki: title, title: label, attribution: 'Wikipedia', license: 'CC BY-SA 4.0' });
const page = (url, attribution, title, license = null) => ({ url, attribution, title, ...(license ? { license } : {}) });
const PUBLIC_DOMAIN = 'Public domain (U.S. government work)';
/** Library of Congress photo searches stay inside "a long time ago" for these memories. */
const PERIOD = { yearFrom: 1900, yearTo: 1975 };

// The meadow's own things (the Red Kite memory), each with several fixed sources and an archive photo search.
const CURATED = {
  kite: { label: 'Kite', heading: 'What keeps a kite in the air?', context: 'About kites', match: /\b(lift|wind|air|force|kite|string|line)\b/gi,
    sources: [page('https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/four-forces-on-a-kite/', 'NASA Glenn Research Center', 'Four Forces on a Kite', PUBLIC_DOMAIN), wiki('Kite'), wiki('Kite_line', 'Kite line')],
    photos: 'children flying kites' },
  flowers: { label: 'Flowers', heading: 'Wildflowers in the grass', context: 'Flower examples; this scene does not identify a species.', match: /\b(daisy|daisies|poppy|poppies|flower|flowers|petal|petals|bloom|blooms|yellow|orange|white)\b/gi,
    sources: [page('https://www.rhs.org.uk/plants/94326/bellis-perennis/details', 'Royal Horticultural Society', 'Bellis perennis · common daisy'), page('https://www.fs.usda.gov/managing-land/wildflowers/plant-of-the-week/eschscholzia-californica', 'USDA Forest Service', 'California poppy', PUBLIC_DOMAIN), wiki('Eschscholzia_californica', 'California poppy'), wiki('Wildflower')],
    photos: 'California poppies' },
  trees: { label: 'Tree', heading: 'How does a tree work?', context: 'About trees generally; species not identified.', match: /\b(tree|leaves|trunk|roots|water|crown)\b/gi,
    sources: [page('https://www.dnr.state.mn.us/forestry/education/foresttreasures/partsofatree.html', 'Minnesota Department of Natural Resources', 'Parts of a tree'), wiki('Tree')],
    photos: 'shade tree' },
  oak: { label: 'Oak', heading: 'The old oak at the bend', context: 'About California oaks generally; this scene does not identify the species.', match: /\b(oak|oaks|acorn|acorns|valley|tree|trees|leaves|bark|grows?)\b/gi,
    sources: [wiki('Quercus_lobata', 'Valley oak'), wiki('Quercus_agrifolia', 'Coast live oak'), wiki('Oak')],
    photos: 'oak tree California' },
  hills: { label: 'Hills', heading: 'The golden hills', context: 'About California grasslands generally.', match: /\b(grass|grasses|grassland|grasslands|prairie|hills?|summer|dry|native|fire)\b/gi,
    sources: [page('https://www.nps.gov/subjects/grasslands/index.htm', 'National Park Service', 'Grasslands', PUBLIC_DOMAIN), wiki('California_coastal_prairie', 'California coastal prairie'), wiki('Grassland')],
    photos: 'California hills' },
  meadow: { label: 'Meadow', heading: 'What makes a meadow?', context: 'About meadows generally.', sources: [wiki('Meadow')], photos: 'meadow children' },
  path: { label: 'Path', heading: 'A path through the grass', context: 'About paths and trails generally.', sources: [wiki('Trail'), wiki('Footpath')], photos: 'country road children' },
  picnic_blanket: { label: 'Picnic', heading: 'A picnic on the grass', context: 'About picnics generally.', sources: [wiki('Picnic')], photos: 'family picnic' },
  bench: { label: 'Bench', heading: 'A bench to sit on', context: 'About benches generally.', sources: [wiki('Bench_(furniture)', 'Bench')], photos: 'park bench' },
};

// Everything else a story can bring into a memory (packages/shared/src/scene.ts LIBRARY): its Wikipedia article, and
// for some a Library of Congress photo search. [article, label, photo search?]
const THINGS = {
  table: ['Table_(furniture)', 'Table'], round_table: ['Table_(furniture)', 'Table'], chair: ['Chair'], armchair: ['Wing_chair', 'Armchair'], sofa: ['Couch', 'Sofa'],
  bed: ['Bed'], bookshelf: ['Bookcase', 'Bookshelf'], cabinet: ['Cabinetry', 'Cabinet'], rug: ['Carpet', 'Rug'], lamp: ['Light_fixture', 'Lamp'],
  floor_lamp: ['Light_fixture', 'Floor lamp'], fireplace: ['Fireplace', 'Fireplace', 'family fireplace'], window: ['Window'], door: ['Door'],
  piano: ['Piano', 'Piano', 'piano family'], radio: ['Radio_receiver', 'Radio', 'family listening radio'], tv: ['Television_set', 'Television', 'family watching television'],
  clock: ['Clock'], picture_frame: ['Picture_frame', 'Picture frame'], vase_flowers: ['Vase', 'Vase of flowers'], potted_plant: ['Houseplant', 'Potted plant'],
  teapot: ['Teapot'], cup: ['Cup'], bowl_fruit: ['Fruit', 'Fruit', 'fruit stand California'], cake: ['Cake', 'Cake', 'birthday cake'], books: ['Book', 'Books'],
  candle: ['Candle'], stove: ['Kitchen_stove', 'Stove', 'kitchen stove'], fridge: ['Refrigerator'], counter: ['Countertop', 'Counter'],
  pine_tree: ['Pine', 'Pine tree'], palm_tree: ['Arecaceae', 'Palm tree', 'palm trees California'], bush: ['Shrub', 'Bush'], fence: ['Fence'],
  swing: ['Swing_(seat)', 'Swing', 'children swing'], lamp_post: ['Street_light', 'Street lamp'], umbrella: ['Umbrella'], boat: ['Boat', 'Boat', 'rowboat'],
  dock: ['Pier', 'Dock'], rock: ['Rock_(geology)', 'Rock'], car: ['Car', 'Car', 'family automobile'], bicycle: ['Bicycle', 'Bicycle', 'children bicycles'],
  house: ['House'], campfire: ['Campfire', 'Campfire', 'campfire'], tent: ['Tent', 'Tent', 'camping tent'], cat: ['Cat', 'Cat', 'child with cat'],
  dog: ['Dog', 'Dog', 'boy with dog'], bird: ['Bird'], wardrobe: ['Wardrobe'], school_desk: ['Desk', 'School desk', 'schoolroom children'], globe: ['Globe'],
  sewing_machine: ['Sewing_machine', 'Sewing machine', 'sewing machine'], telephone: ['Telephone'], typewriter: ['Typewriter'], thermos: ['Vacuum_flask', 'Thermos'],
  rice_cooker: ['Rice_cooker', 'Rice cooker'], electric_fan: ['Mechanical_fan', 'Fan'], desk_fan: ['Mechanical_fan', 'Fan'], mirror: ['Mirror'],
  guitar: ['Guitar', 'Guitar', 'guitar'], suitcase: ['Suitcase'], teddy_bear: ['Teddy_bear', 'Teddy bear'], toy: ['Toy', 'Toy', 'children toys'],
  camera: ['Camera'], basket: ['Basket'], bucket: ['Bucket'], wash_basin: ['Sink', 'Wash basin'], mahjong: ['Mahjong'], chess: ['Chess', 'Chess', 'chess'],
  heater: ['Space_heater', 'Heater'], shoes: ['Shoe', 'Shoes'], hat: ['Hat'], handbag: ['Handbag'], backpack: ['Backpack'], lantern: ['Lantern'],
  fire_hydrant: ['Fire_hydrant', 'Fire hydrant'], mailbox: ['Letter_box', 'Mailbox'], trash_can: ['Waste_container', 'Trash can'],
  cable_car: ['San_Francisco_cable_car_system', 'Cable car', 'cable car San Francisco'], bus: ['Bus'], building: ['Building'], shop: ['Retail', 'Shop', 'grocery store'],
  gazebo: ['Gazebo'], arbor: ['Pergola', 'Arbor'], birdbath: ['Bird_bath', 'Birdbath'], planter: ['Container_garden', 'Planter'], wheelbarrow: ['Wheelbarrow'],
  watering_can: ['Watering_can', 'Watering can'], picnic_table: ['Picnic_table', 'Picnic table', 'picnic table'], slide: ['Playground_slide', 'Slide', 'playground slide'],
  seesaw: ['Seesaw'], playground: ['Playground', 'Playground', 'playground children'], basketball_hoop: ['Basketball', 'Basketball hoop'],
  goal: ['Goal_(sports)', 'Goal'], goalpost: ['Goal_(sports)', 'Goalpost'], bleachers: ['Bleachers'], ball: ['Ball', 'Ball', 'children playing ball'],
  stump: ['Tree_stump', 'Tree stump'], agave: ['Agave'], keepsake_box: ['Memory_box', 'Keepsake box'], story_card: ['Storytelling', 'Story card'], side_table: ['End_table', 'Side table'],
};
const article = (label) => (/^[aeiou]/i.test(label) ? 'an' : 'a');

export const OBJECT_TOPICS = Object.freeze({
  ...CURATED, // first, so a batch reaches the meadow's own things before any archive asks it to slow down
  ...Object.fromEntries(Object.entries(THINGS).map(([key, [title, label = title.replace(/_/g, ' ').replace(/ \(.*\)$/, ''), photos = null]]) =>
    [key, { label, heading: `A little about ${article(label)} ${label.toLowerCase()}`, context: 'General information; not from your story.', sources: [wiki(title, label)], photos }]).filter(([key]) => !Object.hasOwn(CURATED, key))),
});
export const OBJECT_CONTEXT_VERSION = 3;
export const OBJECT_TOPIC_KEYS = Object.freeze(Object.keys(OBJECT_TOPICS));
export function objectTopic(key) {
  if (typeof key !== 'string' || !Object.hasOwn(OBJECT_TOPICS, key)) throw new Error('Choose a supported object topic.');
  return OBJECT_TOPICS[key];
}
const ALIAS = { kite: 'kite', spool: 'kite', flowers: 'flowers', flower: 'flowers', tree: 'trees' };
/** The topic for a thing in a memory (a scene library kind), or null. */
export function topicForKind(kind) {
  if (typeof kind !== 'string') return null;
  return Object.hasOwn(ALIAS, kind) ? ALIAS[kind] : Object.hasOwn(OBJECT_TOPICS, kind) ? kind : null;
}

/** How much of a source may be quoted, in words: open licences a short passage, everything else a brief quotation. */
export const wordsAllowed = (source) => (source?.license === 'CC BY-SA 4.0' ? 60 : source?.license === PUBLIC_DOMAIN ? 50 : 24);
const words = (t) => t.split(/\s+/).filter(Boolean);
const cap = (t, n) => { const w = words(t); return w.slice(0, n).join(' ') + (w.length > n ? '…' : ''); };
const sentencesOf = (t) => (t.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [t]).map((s) => s.trim()).filter(Boolean);

const plain = value => value.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|apos|lt|gt|#0*39|#0*34|#x27);/gi, e => ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#39;': "'", '&#34;': '"', '&#x27;': "'" }[e.toLowerCase()] ?? ' ')).replace(/\s+/g, ' ').trim();
export function extractObjectReference(html, topicKey, source, now = Date.now()) {
  const topic = objectTopic(topicKey);
  if (!topic.sources.some(s => s.url === source.url && !s.wiki)) throw new Error('Unapproved public reference.');
  const match = topic.match ?? /\b\w{5,}\b/gi;
  const clean = html.replace(/<(script|style|nav|header|footer|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const explains = /\b(is|are|has|have|grows?|forms?|forming|produces?|made|uses?|absorb|absorbs|carr(?:y|ies)|contains?|provides?|generated|causes?|creates?|anchors?|keeps?|supports?|helps?|takes?|transports?|moves?|converts?)\b/i;
  const candidates = [...clean.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => plain(m[2])).filter(t => t.length > 65 && t.length < 2000 && explains.test(t) && !/cookie|privacy policy|sign up|newsletter|copyright|all rights reserved|javascript/i.test(t));
  const score = t => (t.match(match) ?? []).length / Math.sqrt(t.length);
  candidates.sort((a, b) => score(b) - score(a));
  const sentences = candidates.flatMap(t => sentencesOf(t)).filter(t => words(t).length >= 7 && words(t).length <= 24 && explains.test(t) && score(t) > .10);
  sentences.sort((a, b) => score(b) - score(a));
  const best = sentences[0] ?? candidates.find(t => score(t) > .10);
  if (!best) throw new Error('No relevant public explanation was found.');
  // A brief attributed quotation (24 words); a public-domain page may also give the sentence that follows it.
  const allowed = wordsAllowed(source);
  let excerpt = best;
  if (allowed > 24) {
    const own = candidates.map(sentencesOf).find(list => list.includes(best)) ?? [];
    const next = own[own.indexOf(best) + 1];
    if (next && words(best).length + words(next).length <= allowed) excerpt = `${best} ${next}`;
  }
  return { topicKey, kind: 'text', sourceUrl: source.url, title: source.title, attribution: source.attribution, ...(source.license ? { license: source.license } : {}), excerpt: cap(excerpt, allowed), fetchedAt: now };
}

/** A Wikipedia lead, as plain sentences: pronunciations and empty brackets out, at most three sentences. */
export function wikiExcerpt(extract, source) {
  const text = String(extract ?? '').replace(/\s*\([^()]*[/ˈˌ][^()]*\)/g, '').replace(/\(\s*[;,]?\s*\)/g, '').replace(/\s+([,.;])/g, '$1').replace(/\s+/g, ' ').trim();
  if (/may refer to:|is a disambiguation/i.test(text)) return null; // a disambiguation page, not "Garbage may refer to food waste"
  const allowed = wordsAllowed(source), out = [];
  for (const s of sentencesOf(text).slice(0, 3)) { if (words([...out, s].join(' ')).length > allowed && out.length) break; out.push(s); }
  const excerpt = cap(out.join(' '), allowed);
  return excerpt.length >= 40 ? excerpt : null;
}

export function normalizeObjectReferences(rows, topicKey) {
  const topic = objectTopic(topicKey), seen = new Set(), texts = [], photos = [];
  if (!Array.isArray(rows)) return [];
  for (const row of rows.slice(0, 16)) {
    if (row?.topicKey !== topicKey || typeof row.excerpt !== 'string' || /<[^>]+>/.test(row.excerpt + (row.title ?? ''))) continue;
    const fetchedAt = Number.isFinite(row.fetchedAt) ? row.fetchedAt : Date.now();
    if (row.kind === 'photo') {
      const sourceUrl = safeArchiveUrl(row.sourceUrl), imageUrl = safeArchiveUrl(row.imageUrl, true);
      if (!sourceUrl || !imageUrl || seen.has(sourceUrl) || photos.length >= 3) continue;
      const title = String(row.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
      if (title.length < 3) continue;
      photos.push({ topicKey, kind: 'photo', sourceUrl, title, attribution: 'Library of Congress', excerpt: title, imageUrl, date: String(row.date ?? '').slice(0, 60), fetchedAt });
      seen.add(sourceUrl); continue;
    }
    const source = topic.sources.find(s => s.url === row.sourceUrl);
    if (!source || seen.has(source.url) || texts.length >= 4) continue;
    const excerpt = cap(row.excerpt.replace(/\s+/g, ' ').trim(), wordsAllowed(source)).slice(0, 520);
    if (excerpt.length < 30) continue;
    texts.push({ topicKey, kind: 'text', sourceUrl: source.url, title: source.title, attribution: source.attribution, ...(source.license ? { license: source.license } : {}), excerpt, fetchedAt });
    seen.add(source.url);
  }
  return [...texts, ...photos];
}

const UA = 'MemoryGate-SourceAtlas/1.4 (public educational references; github.com/ManagementMO/memory-gate)';
async function readText(url, request, accept) {
  const response = await request(url, { redirect: 'error', headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(18000) });
  if (!response.ok || !response.headers.get('content-type')?.includes(accept) || Number(response.headers.get('content-length')) > 2_000_000) throw new Error('The public reference is unavailable.');
  const reader = response.body?.getReader(); if (!reader) throw new Error('No public page returned.');
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); throw new Error('The reference page exceeds the limit.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
/** Wikipedia leads for up to twenty fixed article titles in one request (redirects followed by the API, not by us). */
async function wikiLeads(titles, request) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'extracts', exintro: '1', explaintext: '1', exsentences: '4', exlimit: '20', redirects: '1', titles: titles.join('|') }).toString();
  const json = JSON.parse(await readText(url, request, 'application/json'));
  const renamed = new Map([...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])].map(x => [x.from, x.to]));
  const byTitle = new Map((json.query?.pages ?? []).filter(p => !p.missing).map(p => [p.title, p.extract]));
  const follow = (n) => { for (let i = 0; i < 3 && renamed.has(n); i++) n = renamed.get(n); return n; };
  return new Map(titles.map(t => [t, byTitle.get(follow(t)) ?? byTitle.get(follow(t.replace(/_/g, ' '))) ?? null]));
}

/**
 * One topic (a person selected a thing) or many at once (preparing the saved copy the app falls back on). Each source
 * that fails is skipped; a single topic with nothing at all fails. `pause` spaces requests to the public services.
 */
export async function collectObjectKnowledge(input, request = fetch, { pause = 1000 } = {}) {
  const keys = Array.isArray(input?.topicKeys) ? [...new Set(input.topicKeys)].slice(0, 150) : [input?.topicKey];
  keys.forEach(objectTopic);
  const wait = () => new Promise(r => setTimeout(r, pause));
  const now = Date.now(), references = [], warnings = [];
  let archiveLimited = false; // the Library of Congress asked us to slow down: no more photo searches this run
  // Wikipedia: every article these topics name, twenty to a request.
  const titles = [...new Set(keys.flatMap(k => OBJECT_TOPICS[k].sources.filter(s => s.wiki).map(s => s.wiki)))];
  const leads = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    try { for (const [t, e] of await wikiLeads(titles.slice(i, i + 20), request)) leads.set(t, e); }
    catch (e) { warnings.push(`Wikipedia: ${e.message}`); }
    if (i + 20 < titles.length) await wait();
  }
  for (const key of keys) {
    const topic = OBJECT_TOPICS[key], before = references.length;
    for (const source of topic.sources) {
      try {
        if (source.wiki) { const excerpt = wikiExcerpt(leads.get(source.wiki), source); if (excerpt) references.push({ topicKey: key, kind: 'text', sourceUrl: source.url, title: source.title, attribution: source.attribution, license: source.license, excerpt, fetchedAt: now }); continue; }
        references.push(extractObjectReference(await readText(source.url, request, 'text/html'), key, source, now));
      } catch (e) { warnings.push(`${key} · ${source.attribution}: ${e.message}`); }
    }
    if (topic.photos && !archiveLimited) {
      try {
        // The Library of Congress allows only a gentle pace; a batch keeps well under it.
        for (const p of await findPhotos({ q: topic.photos, ...PERIOD, maxItems: 3 }, { fetcher: request, pause: keys.length > 1 ? pause * 2.5 : 0 })) {
          references.push({ topicKey: key, kind: 'photo', sourceUrl: p.sourceUrl, title: p.title, attribution: 'Library of Congress', excerpt: p.title, imageUrl: p.imageUrl, date: p.date, fetchedAt: now });
        }
      } catch (e) { warnings.push(`${key} · Library of Congress: ${e.message}`); if (/\(429\)/.test(e.message)) archiveLimited = true; }
      if (keys.length > 1) await wait();
    }
    if (keys.length === 1 && references.length === before) throw new Error('The public reference is unavailable.');
  }
  return { schema: 'memory-gate.object-context/2', topicKeys: keys, topicKey: keys.length === 1 ? keys[0] : undefined, references, warnings, note: 'Public context, not a personal recollection or species identification.' };
}
