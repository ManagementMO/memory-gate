// Words → a memory sketch. The contract shared by the server (Claude plans) and every client (draws the plan).
// A plan says what is there and roughly where, in plain terms ("the radio on the shelf by the window"); layout()
// turns it into metres deterministically, so a phone, a laptop and a headset all draw the same place.
// No raw transcript reaches a 3D generator: labels and colours are vetted words and hex values.

export type TimeOfDay = 'morning' | 'midday' | 'golden' | 'dusk' | 'night';
export type Weather = 'clear' | 'soft' | 'rain' | 'snow' | 'mist';
export type Floor = 'wood' | 'tile' | 'carpet' | 'grass' | 'sand' | 'stone' | 'snow' | 'water';
export type Ambience = 'dust' | 'petals' | 'snow' | 'fireflies' | 'rain' | 'leaves' | 'none';
export type Zone = 'center' | 'back' | 'left' | 'right' | 'back-left' | 'back-right' | 'front-left' | 'front-right';
export type Relation = 'on' | 'next_to' | 'under' | 'in_front_of' | 'behind' | 'against_wall' | 'none';
export type MaterialKind = 'wood' | 'fabric' | 'metal' | 'ceramic' | 'glass' | 'paper' | 'plant' | 'stone' | 'plastic' | 'water' | 'light';

export type PlanObject = {
  id: string;
  /** A LIBRARY key, or 'custom' for something the library doesn't draw (composed from primitives). */
  kind: string;
  label: string;
  color: string | null;
  material: MaterialKind | null;
  zone: Zone;
  relation: Relation;
  /** The id of another object this relation refers to (the table it sits on, the tree it stands beside). */
  target: string | null;
  scale: number;
  /** The words that put it there (shown when someone asks "who said that?"). */
  quote: string | null;
  /** Where the person put it, in a prepared place's own frame (metres, x/z), when they said or showed where. */
  at?: [number, number];
};

export type ScenePlan = {
  version: 1;
  title: string;
  setting: {
    indoor: boolean;
    type: string;
    timeOfDay: TimeOfDay;
    weather: Weather;
    floor: Floor;
    /** Up to three remembered colours that tint the whole place (walls, light, sky). */
    palette: string[];
    walls: boolean;
    water: boolean;
  };
  ambience: Ambience;
  objects: PlanObject[];
  /** The companion's first line once the place has formed (≤ 22 words, present tense, in the speaker's words). */
  intro: string;
};

export type Placement = { id: string; x: number; y: number; z: number; yaw: number; scale: number; on: string | null };

// ---------------------------------------------------------------- the library's vocabulary
type Place = 'floor' | 'wall' | 'wall-mounted' | 'surface' | 'floor-under' | 'water' | 'backdrop' | 'edge';
export type LibraryEntry = { fp: [number, number]; h: number; place: Place; surface?: number; syn: string[]; material: MaterialKind };

/** Default sizes are real-world metres (footprint width × depth, height); `surface` is the height things rest on. */
export const LIBRARY: Record<string, LibraryEntry> = {
  table: { fp: [1.4, 0.85], h: 0.76, place: 'floor', surface: 0.76, syn: ['table', 'dining table', 'kitchen table', 'desk', 'workbench'], material: 'wood' },
  round_table: { fp: [1.0, 1.0], h: 0.74, place: 'floor', surface: 0.74, syn: ['round table', 'coffee table', 'cafe table'], material: 'wood' },
  chair: { fp: [0.48, 0.5], h: 0.92, place: 'floor', syn: ['chair', 'chairs', 'stool', 'seat', 'kitchen chair', 'dining chair'], material: 'wood' },
  armchair: { fp: [0.85, 0.85], h: 0.95, place: 'floor', syn: ['armchair', 'recliner', 'easy chair', 'rocking chair', 'reading chair'], material: 'fabric' },
  sofa: { fp: [2.0, 0.9], h: 0.85, place: 'wall', syn: ['sofa', 'couch', 'settee', 'loveseat'], material: 'fabric' },
  bed: { fp: [1.6, 2.1], h: 0.95, place: 'wall', syn: ['bed', 'crib', 'cot'], material: 'fabric' },
  bookshelf: { fp: [0.9, 0.32], h: 1.9, place: 'wall', surface: 1.9, syn: ['bookshelf', 'bookcase', 'shelves', 'shelf'], material: 'wood' },
  cabinet: { fp: [1.0, 0.45], h: 0.9, place: 'wall', surface: 0.9, syn: ['cabinet', 'dresser', 'sideboard', 'cupboard', 'chest of drawers', 'drawers', 'nightstand', 'hutch'], material: 'wood' },
  rug: { fp: [2.2, 1.5], h: 0.02, place: 'floor-under', syn: ['rug', 'carpet', 'mat'], material: 'fabric' },
  lamp: { fp: [0.3, 0.3], h: 0.55, place: 'surface', syn: ['lamp', 'table lamp', 'reading lamp'], material: 'fabric' },
  floor_lamp: { fp: [0.4, 0.4], h: 1.65, place: 'floor', syn: ['floor lamp', 'standing lamp'], material: 'metal' },
  fireplace: { fp: [1.5, 0.45], h: 1.2, place: 'wall', surface: 1.2, syn: ['fireplace', 'hearth', 'mantel', 'mantelpiece', 'wood stove'], material: 'stone' },
  window: { fp: [1.3, 0.12], h: 1.6, place: 'wall-mounted', syn: ['window', 'windows', 'curtains', 'curtain', 'drapes'], material: 'glass' },
  door: { fp: [0.95, 0.1], h: 2.1, place: 'wall-mounted', syn: ['door', 'doorway', 'front door'], material: 'wood' },
  piano: { fp: [1.5, 0.6], h: 1.25, place: 'wall', surface: 1.25, syn: ['piano', 'upright piano', 'organ'], material: 'wood' },
  radio: { fp: [0.36, 0.18], h: 0.24, place: 'surface', syn: ['radio', 'record player', 'gramophone', 'phonograph', 'turntable', 'stereo'], material: 'wood' },
  tv: { fp: [0.9, 0.3], h: 0.6, place: 'surface', syn: ['tv', 'television', 'telly'], material: 'plastic' },
  clock: { fp: [0.4, 0.1], h: 0.4, place: 'wall-mounted', syn: ['clock', 'wall clock', 'cuckoo clock'], material: 'wood' },
  picture_frame: { fp: [0.5, 0.05], h: 0.6, place: 'wall-mounted', syn: ['picture', 'painting', 'photo', 'photograph', 'frame', 'portrait', 'poster'], material: 'wood' },
  vase_flowers: { fp: [0.25, 0.25], h: 0.5, place: 'surface', syn: ['vase', 'flowers in a vase', 'bouquet', 'vase of flowers'], material: 'ceramic' },
  potted_plant: { fp: [0.5, 0.5], h: 1.0, place: 'floor', syn: ['plant', 'potted plant', 'fern', 'houseplant', 'ficus'], material: 'plant' },
  teapot: { fp: [0.28, 0.2], h: 0.22, place: 'surface', syn: ['teapot', 'kettle', 'tea pot'], material: 'ceramic' },
  cup: { fp: [0.12, 0.12], h: 0.1, place: 'surface', syn: ['cup', 'mug', 'teacup', 'coffee cup', 'cups'], material: 'ceramic' },
  bowl_fruit: { fp: [0.32, 0.32], h: 0.18, place: 'surface', syn: ['fruit bowl', 'bowl of fruit', 'fruit', 'oranges', 'apples', 'bowl', 'lemons'], material: 'ceramic' },
  cake: { fp: [0.32, 0.32], h: 0.2, place: 'surface', syn: ['cake', 'pie', 'birthday cake', 'bread', 'cookies', 'loaf'], material: 'ceramic' },
  books: { fp: [0.3, 0.22], h: 0.2, place: 'surface', syn: ['books', 'book', 'stack of books', 'newspaper'], material: 'paper' },
  candle: { fp: [0.1, 0.1], h: 0.25, place: 'surface', syn: ['candle', 'candles', 'candlestick', 'menorah'], material: 'light' },
  stove: { fp: [0.76, 0.65], h: 0.92, place: 'wall', surface: 0.92, syn: ['stove', 'oven', 'range', 'cooker'], material: 'metal' },
  fridge: { fp: [0.75, 0.7], h: 1.75, place: 'wall', syn: ['fridge', 'refrigerator', 'icebox'], material: 'metal' },
  counter: { fp: [1.8, 0.62], h: 0.92, place: 'wall', surface: 0.92, syn: ['counter', 'kitchen counter', 'sink', 'countertop', 'kitchen cabinets'], material: 'wood' },
  tree: { fp: [2.2, 2.2], h: 4.2, place: 'floor', syn: ['tree', 'trees', 'oak', 'oak tree', 'maple', 'apple tree', 'cherry tree', 'willow', 'lemon tree', 'orange tree', 'fig tree'], material: 'plant' },
  pine_tree: { fp: [1.8, 1.8], h: 4.8, place: 'floor', syn: ['pine', 'pine tree', 'pines', 'fir', 'evergreen', 'christmas tree', 'spruce'], material: 'plant' },
  palm_tree: { fp: [1.6, 1.6], h: 4.5, place: 'floor', syn: ['palm', 'palm tree', 'palms', 'coconut tree'], material: 'plant' },
  bush: { fp: [1.2, 1.0], h: 0.9, place: 'floor', syn: ['bush', 'bushes', 'shrub', 'hedge', 'hydrangea', 'rose bush', 'lilac'], material: 'plant' },
  flowers: { fp: [1.4, 0.8], h: 0.45, place: 'floor', syn: ['flower bed', 'flowers', 'tulips', 'roses', 'garden bed', 'daisies', 'sunflowers', 'lavender', 'wildflowers'], material: 'plant' },
  bench: { fp: [1.5, 0.55], h: 0.85, place: 'floor', syn: ['bench', 'park bench', 'garden bench'], material: 'wood' },
  fence: { fp: [3.0, 0.1], h: 1.0, place: 'edge', syn: ['fence', 'picket fence', 'railing', 'gate', 'wall'], material: 'wood' },
  swing: { fp: [1.8, 1.2], h: 2.2, place: 'floor', syn: ['swing', 'swing set', 'porch swing', 'hammock', 'tire swing'], material: 'wood' },
  lamp_post: { fp: [0.4, 0.4], h: 3.0, place: 'floor', syn: ['lamp post', 'street lamp', 'streetlight', 'lantern'], material: 'metal' },
  umbrella: { fp: [2.0, 2.0], h: 2.2, place: 'floor', syn: ['umbrella', 'beach umbrella', 'parasol'], material: 'fabric' },
  picnic_blanket: { fp: [1.6, 1.3], h: 0.05, place: 'floor-under', syn: ['blanket', 'picnic blanket', 'picnic', 'towel', 'beach towel', 'quilt'], material: 'fabric' },
  boat: { fp: [1.3, 3.6], h: 0.9, place: 'water', syn: ['boat', 'rowboat', 'canoe', 'sailboat', 'kayak', 'fishing boat'], material: 'wood' },
  dock: { fp: [1.6, 5.0], h: 0.5, place: 'water', syn: ['dock', 'pier', 'jetty', 'boardwalk'], material: 'wood' },
  rock: { fp: [1.0, 0.9], h: 0.6, place: 'floor', syn: ['rock', 'rocks', 'boulder', 'stone', 'stones'], material: 'stone' },
  car: { fp: [1.8, 4.3], h: 1.45, place: 'floor', syn: ['car', 'station wagon', 'truck', 'van', 'pickup'], material: 'metal' },
  bicycle: { fp: [0.6, 1.75], h: 1.0, place: 'floor', syn: ['bike', 'bicycle', 'tricycle'], material: 'metal' },
  house: { fp: [7.0, 6.0], h: 6.0, place: 'backdrop', syn: ['house', 'cottage', 'home', 'farmhouse', 'barn', 'cabin', 'church'], material: 'wood' },
  campfire: { fp: [1.0, 1.0], h: 0.5, place: 'floor', syn: ['campfire', 'bonfire', 'fire pit', 'fire'], material: 'stone' },
  tent: { fp: [2.2, 2.4], h: 1.5, place: 'floor', syn: ['tent'], material: 'fabric' },
  cat: { fp: [0.25, 0.5], h: 0.3, place: 'floor', syn: ['cat', 'kitten', 'cats'], material: 'ceramic' },
  dog: { fp: [0.4, 0.85], h: 0.55, place: 'floor', syn: ['dog', 'puppy', 'dogs'], material: 'ceramic' },
  bird: { fp: [0.15, 0.2], h: 0.15, place: 'surface', syn: ['bird', 'birds', 'robin', 'sparrow', 'parrot', 'canary', 'bird cage', 'birdcage'], material: 'ceramic' },
  // The team's Red Kite props (Blender, apps/gate/public/red-kite): a paper kite flies (layout lifts it into the air).
  kite: { fp: [0.68, 0.13], h: 1.93, place: 'floor', syn: ['kite', 'kites', 'paper kite'], material: 'paper' },
  spool: { fp: [0.17, 0.11], h: 0.11, place: 'surface', syn: ['spool', 'kite string', 'string spool', 'reel'], material: 'wood' },
  keepsake_box: { fp: [0.26, 0.18], h: 0.1, place: 'surface', syn: ['keepsake box', 'little box', 'wooden box', 'memory box', 'treasure box'], material: 'wood' },
  story_card: { fp: [0.15, 0.01], h: 0.1, place: 'surface', syn: ['story card', 'postcard', 'little card', 'note card'], material: 'paper' },
  side_table: { fp: [0.65, 0.45], h: 0.76, place: 'floor', surface: 0.76, syn: ['side table', 'small table', 'little table', 'folding table'], material: 'wood' },
};
export const LIBRARY_KEYS = Object.keys(LIBRARY);
/** A generic default for 'custom' objects composed from primitives. */
export const CUSTOM_ENTRY: LibraryEntry = { fp: [0.6, 0.6], h: 0.8, place: 'floor', syn: [], material: 'ceramic' };
export const entryOf = (kind: string): LibraryEntry => LIBRARY[kind] ?? CUSTOM_ENTRY;

// ---------------------------------------------------------------- colours
export const COLORS: Record<string, string> = {
  red: '#c0504d', crimson: '#a8323a', rose: '#d98a96', pink: '#e8a0b4', orange: '#e08a3c', peach: '#f2b58f', coral: '#e8846b',
  yellow: '#e8c547', gold: '#d4a73a', golden: '#d4a73a', mustard: '#c9a23a', cream: '#efe4c8', ivory: '#f0ead8', beige: '#d9c7a6',
  tan: '#c8a77c', brown: '#8a5a3b', chocolate: '#5e3b27', mahogany: '#6b2e24', walnut: '#5f4330', oak: '#b88a5a', pine: '#d9b98a',
  green: '#5c9a5a', olive: '#7d8a3c', sage: '#9caf88', mint: '#a6dcc4', emerald: '#2f8a5f', teal: '#2f8a8a', turquoise: '#3fb7b0',
  blue: '#4a78b8', navy: '#2c3e66', sky: '#8cc3e8', 'sky blue': '#8cc3e8', 'light blue': '#a9cdec', 'baby blue': '#a9cdec', 'dark blue': '#2c4a7a',
  purple: '#7c5aa6', lavender: '#b9a6dc', lilac: '#c8a8d8', violet: '#8a5cc0', plum: '#7a3f6b',
  white: '#f4f2ee', black: '#2b2b30', grey: '#9a9aa2', gray: '#9a9aa2', silver: '#c4c7cf', charcoal: '#4a4a52',
  copper: '#b87346', brass: '#c9a54f', checkered: '#c0504d', striped: '#4a78b8', floral: '#d98a96', plaid: '#a8323a',
};
const COLOR_WORDS = Object.keys(COLORS).sort((a, b) => b.length - a.length);

export function colorOf(word: string | null | undefined): string | null {
  if (!word) return null;
  const w = word.toLowerCase().trim();
  if (/^#[0-9a-f]{6}$/.test(w)) return w;
  return COLORS[w] ?? null;
}

// ---------------------------------------------------------------- validation (everything Claude returns passes here)
const ZONES: readonly Zone[] = ['center', 'back', 'left', 'right', 'back-left', 'back-right', 'front-left', 'front-right'];
const RELATIONS: readonly Relation[] = ['on', 'next_to', 'under', 'in_front_of', 'behind', 'against_wall', 'none'];
const TIMES: readonly TimeOfDay[] = ['morning', 'midday', 'golden', 'dusk', 'night'];
const WEATHERS: readonly Weather[] = ['clear', 'soft', 'rain', 'snow', 'mist'];
const FLOORS: readonly Floor[] = ['wood', 'tile', 'carpet', 'grass', 'sand', 'stone', 'snow', 'water'];
const AMBIENCES: readonly Ambience[] = ['dust', 'petals', 'snow', 'fireflies', 'rain', 'leaves', 'none'];
const MATERIALS: readonly MaterialKind[] = ['wood', 'fabric', 'metal', 'ceramic', 'glass', 'paper', 'plant', 'stone', 'plastic', 'water', 'light'];
const SAFE = /^[\p{L}\p{N}' ,.-]{1,48}$/u;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v as string) ? (v as T) : fallback;
const hex = (v: unknown): string | null => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : colorOf(typeof v === 'string' ? v : null));
const clean = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.replace(/https?:\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : fallback);

/** Map a free label to a library key using synonyms (longest match wins), else 'custom'. */
export function kindFor(label: string, proposed?: string): string {
  if (proposed && LIBRARY[proposed]) return proposed;
  const l = ` ${label.toLowerCase()} `;
  let best: { key: string; len: number } | null = null;
  for (const [key, e] of Object.entries(LIBRARY)) {
    for (const s of e.syn) if (l.includes(` ${s} `) || l.includes(` ${s}s `) || l.includes(` ${s}es `)) { if (!best || s.length > best.len) best = { key, len: s.length }; }
  }
  return best?.key ?? 'custom';
}

export function validatePlan(raw: unknown, fallbackTitle = 'A remembered place'): ScenePlan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = (r.setting ?? {}) as Record<string, unknown>;
  const indoor = typeof s.indoor === 'boolean' ? s.indoor : true;
  const rawObjects = Array.isArray(r.objects) ? r.objects.slice(0, 16) : [];
  const ids = new Set<string>();
  const objects: PlanObject[] = [];
  for (const [i, o] of rawObjects.entries()) {
    const x = (o ?? {}) as Record<string, unknown>;
    const label = clean(x.label, 40).toLowerCase();
    if (!label || !SAFE.test(label)) continue;
    let id = clean(x.id, 24).replace(/[^a-z0-9_-]/gi, '').toLowerCase() || `${label.replace(/[^a-z]+/g, '-').slice(0, 14)}-${i}`;
    while (ids.has(id)) id = `${id}-${i}`;
    ids.add(id);
    const kind = kindFor(label, typeof x.kind === 'string' ? x.kind : undefined);
    objects.push({
      id, kind, label,
      color: hex(x.color),
      material: x.material ? pick(x.material, MATERIALS, entryOf(kind).material) : null,
      zone: pick(x.zone, ZONES, 'center'),
      relation: pick(x.relation, RELATIONS, 'none'),
      target: typeof x.target === 'string' && x.target.trim() ? clean(x.target, 24).toLowerCase() : null,
      scale: typeof x.scale === 'number' && Number.isFinite(x.scale) ? Math.min(1.8, Math.max(0.5, x.scale)) : 1,
      quote: x.quote ? clean(x.quote, 120) : null,
    });
  }
  // Targets must name an object in this plan.
  for (const o of objects) if (o.target && !ids.has(o.target)) o.target = null;
  const palette = (Array.isArray(s.palette) ? s.palette : []).map(hex).filter((c): c is string => !!c).slice(0, 3);
  const type = clean(s.type, 32).toLowerCase() || (indoor ? 'room' : 'garden');
  return {
    version: 1,
    title: clean(r.title, 48) || fallbackTitle,
    setting: {
      indoor, type,
      timeOfDay: pick(s.timeOfDay, TIMES, 'golden'),
      weather: pick(s.weather, WEATHERS, 'clear'),
      floor: pick(s.floor, FLOORS, indoor ? 'wood' : 'grass'),
      palette,
      walls: typeof s.walls === 'boolean' ? s.walls && indoor : indoor,
      water: typeof s.water === 'boolean' ? s.water : /beach|lake|sea|ocean|river|pond|harbor|dock/.test(type),
    },
    ambience: pick(r.ambience, AMBIENCES, indoor ? 'dust' : 'leaves'),
    objects,
    intro: clean(r.intro, 160) || 'Here we are.',
  };
}

// ---------------------------------------------------------------- offline planner (no tokens): keywords → plan
const SETTINGS: { re: RegExp; type: string; indoor: boolean; floor: Floor; water?: boolean; seed: string[] }[] = [
  { re: /\bkitchen\b/, type: 'kitchen', indoor: true, floor: 'tile', seed: ['counter', 'table', 'chair', 'window'] },
  { re: /\b(living room|lounge|parlou?r|sitting room|den)\b/, type: 'living room', indoor: true, floor: 'wood', seed: ['sofa', 'rug', 'armchair', 'window'] },
  { re: /\bbedroom\b|\bbed\b/, type: 'bedroom', indoor: true, floor: 'wood', seed: ['bed', 'cabinet', 'window', 'lamp'] },
  { re: /\bdining room\b/, type: 'dining room', indoor: true, floor: 'wood', seed: ['table', 'chair', 'chair', 'window'] },
  { re: /\b(classroom|school)\b/, type: 'classroom', indoor: true, floor: 'wood', seed: ['table', 'chair', 'chair', 'books', 'window'] },
  { re: /\b(cafe|café|diner|restaurant|bakery)\b/, type: 'café', indoor: true, floor: 'tile', seed: ['round_table', 'chair', 'chair', 'cup', 'window'] },
  { re: /\b(church|chapel)\b/, type: 'chapel', indoor: true, floor: 'stone', seed: ['bench', 'bench', 'candle', 'window'] },
  { re: /\bbeach|ocean|seaside|shore\b/, type: 'beach', indoor: false, floor: 'sand', water: true, seed: ['umbrella', 'picnic_blanket', 'palm_tree'] },
  { re: /\blake|pond|river\b/, type: 'lake', indoor: false, floor: 'grass', water: true, seed: ['dock', 'tree', 'pine_tree', 'boat'] },
  { re: /\b(porch|veranda|patio|deck)\b/, type: 'porch', indoor: false, floor: 'wood', seed: ['swing', 'potted_plant', 'fence', 'house'] },
  { re: /\b(garden|back ?yard|yard|orchard)\b/, type: 'garden', indoor: false, floor: 'grass', seed: ['tree', 'flowers', 'bench', 'fence'] },
  { re: /\bpark\b/, type: 'park', indoor: false, floor: 'grass', seed: ['tree', 'bench', 'lamp_post', 'tree'] },
  { re: /\b(forest|woods)\b/, type: 'woods', indoor: false, floor: 'grass', seed: ['pine_tree', 'pine_tree', 'tree', 'rock'] },
  { re: /\b(camp|camping|campfire)\b/, type: 'campsite', indoor: false, floor: 'grass', seed: ['tent', 'campfire', 'pine_tree', 'rock'] },
  { re: /\b(farm|barn|field|meadow)\b/, type: 'farm', indoor: false, floor: 'grass', seed: ['house', 'fence', 'tree', 'flowers'] },
  { re: /\b(snow|winter|sledding)\b/, type: 'snowy field', indoor: false, floor: 'snow', seed: ['pine_tree', 'pine_tree', 'house'] },
  { re: /\b(street|road|neighbou?rhood|driveway)\b/, type: 'street', indoor: false, floor: 'stone', seed: ['house', 'lamp_post', 'tree', 'car'] },
];

const TIME_WORDS: [RegExp, TimeOfDay][] = [
  [/\b(night|midnight|stars|starry|moon(lit)?|evening)\b/, 'night'], [/\b(dusk|twilight|sunset|sundown)\b/, 'dusk'],
  [/\b(golden|afternoon|late afternoon|warm light)\b/, 'golden'], [/\b(morning|breakfast|dawn|sunrise|early)\b/, 'morning'], [/\b(noon|midday|lunch)\b/, 'midday'],
];

function inferTitle(words: string, type: string): string {
  const owner = words.match(/\b(my )?(grand(?:ma|mother|pa|father|parents)|nana|granny|mom|mother|dad|father|aunt \w+|uncle \w+)'?s? (house|home|kitchen|garden|farm|porch|apartment|cabin|living room)\b/i);
  if (owner) return `${owner[2]!.replace(/^\w/, (c) => c.toUpperCase())}'s ${owner[3]}`;
  return `The ${type}`;
}

export function planOffline(text: string, title?: string | null, opts: { seeds?: boolean } = {}): ScenePlan {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ')} `;
  const setting = SETTINGS.find((s) => s.re.test(t)) ?? { type: 'room', indoor: true, floor: 'wood' as Floor, seed: ['table', 'chair', 'window'] };
  const timeOfDay = TIME_WORDS.find(([re]) => re.test(t))?.[1] ?? (setting.indoor ? 'golden' : 'golden');
  const weather: Weather = /\b(rain|raining|rainy|storm)\b/.test(t) ? 'rain' : /\bsnow(ing|y)?\b/.test(t) ? 'snow' : /\b(fog|foggy|mist|misty)\b/.test(t) ? 'mist' : 'clear';
  const objects: PlanObject[] = [];
  const used = new Set<string>();
  // Mentioned things first, with any colour word right before them ("the yellow curtains").
  const mentions: { key: string; at: number; label: string }[] = [];
  for (const [key, e] of Object.entries(LIBRARY)) {
    for (const s of [...e.syn].sort((a, b) => b.length - a.length)) {
      const i = t.indexOf(` ${s} `);
      const j = i >= 0 ? i : t.indexOf(` ${s}s `) >= 0 ? t.indexOf(` ${s}s `) : t.indexOf(` ${s}es `); // benches, boxes
      if (j >= 0) { mentions.push({ key, at: j, label: i >= 0 ? s : `${s}s` }); break; }
    }
  }
  mentions.sort((a, b) => a.at - b.at);
  for (const m of mentions) {
    // "a round wooden table": a round table, even with a word between.
    if (m.key === 'table' && /\bround(?: \w+)? $/.test(t.slice(Math.max(0, m.at - 22), m.at + 1))) m.key = 'round_table';
    if (used.has(m.key) && !['chair', 'tree', 'pine_tree', 'bench'].includes(m.key)) continue;
    used.add(m.key);
    // A colour said just before the thing ("the yellow curtains"); include the space before the noun.
    const before = t.slice(Math.max(0, m.at - 24), m.at + 1);
    const cw = COLOR_WORDS.find((c) => before.includes(` ${c} `));
    const id = `${m.key}-${objects.length}`;
    objects.push({ id, kind: m.key, label: m.label, color: cw ? COLORS[cw]! : null, material: null, zone: 'center', relation: 'none', target: null, scale: 1, quote: null });
    (objects[objects.length - 1] as PlanObject & { _at?: number })._at = m.at + m.label.length + 1;
  }
  // A few things the setting implies, so a sparse description still forms a place.
  const family = (k: string) => (k === 'round_table' ? 'table' : k);
  for (const k of opts.seeds === false ? [] : setting.seed) {
    if (objects.length >= 7) break;
    if ([...used].some((u) => family(u) === family(k)) && k !== 'chair') continue;
    used.add(k);
    objects.push({ id: `${k}-${objects.length}`, kind: k, label: k.replace(/_/g, ' '), color: null, material: null, zone: 'center', relation: 'none', target: null, scale: 1, quote: null });
  }
  // "... on the counter", "... by the fireplace": the words right after a thing name what it relates to.
  const after = (o: PlanObject) => t.slice((o as PlanObject & { _at?: number })._at ?? 0, ((o as PlanObject & { _at?: number })._at ?? 0) + 40);
  const named = (phrase: string) => objects.find((x) => LIBRARY[x.kind]?.syn.some((sy) => phrase.startsWith(sy)));
  for (const o of objects) {
    const m = after(o).match(/^\s*(on|by|next to|beside|near|under) (?:the |a |an |her |his |my |our |their )?([\p{L} ]{3,30})/u);
    if (!m) continue;
    const host = named(m[2]!);
    if (!host || host === o) continue;
    o.relation = m[1] === 'on' ? 'on' : m[1] === 'under' ? 'under' : 'next_to';
    o.target = host.id;
  }
  // Small things go on the first surface (unless they already have one); chairs go by the table.
  const surface = objects.find((o) => (LIBRARY[o.kind]?.surface ?? 0) > 0 && LIBRARY[o.kind]?.place !== 'wall-mounted');
  for (const o of objects) {
    const e = LIBRARY[o.kind];
    if (e?.place === 'surface' && surface && o.relation !== 'on') { o.relation = 'on'; o.target = surface.id; }
    if (o.kind === 'chair') { const table = objects.find((x) => x.kind === 'table' || x.kind === 'round_table'); if (table) { o.relation = 'next_to'; o.target = table.id; } }
  }
  for (const o of objects) delete (o as PlanObject & { _at?: number })._at;
  const palette = COLOR_WORDS.filter((c) => t.includes(` ${c} `)).slice(0, 3).map((c) => COLORS[c]!);
  const plan = validatePlan({
    title: title ?? inferTitle(text, setting.type),
    setting: { indoor: setting.indoor, type: setting.type, timeOfDay, weather, floor: setting.floor, palette, walls: setting.indoor, water: !!('water' in setting && setting.water) },
    ambience: setting.indoor ? 'dust' : weather === 'snow' ? 'snow' : timeOfDay === 'night' ? 'fireflies' : 'leaves',
    objects,
    intro: setting.indoor ? `Here we are. ${title ?? inferTitle(text, setting.type)}, just as you described it.` : `Here we are. Can you feel the air?`,
  });
  return plan;
}

// ---------------------------------------------------------------- layout: a plan → positions in metres
/** Room frame: centred on the memory centre, back wall behind, viewer in front (+Z). */
export const ROOM = { width: 6.2, depth: 4.6, outdoorRadius: 5.2 };

const ZONE_ANCHOR: Record<Zone, [number, number]> = {
  center: [0, 0.1], back: [0, -1.55], left: [-2.2, -0.2], right: [2.2, -0.2],
  'back-left': [-1.9, -1.4], 'back-right': [1.9, -1.4], 'front-left': [-1.8, 0.75], 'front-right': [1.8, 0.75],
};

type Box = { id: string; x: number; z: number; w: number; d: number };
const overlaps = (a: Box, b: Box, pad = 0.12) => Math.abs(a.x - b.x) * 2 < a.w + b.w + pad * 2 && Math.abs(a.z - b.z) * 2 < a.d + b.d + pad * 2;

function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/**
 * Deterministic placement. Coordinates are relative to the memory centre (add it when drawing).
 * Wall things line the back wall; floor things settle in their zones without overlapping; surface things rest
 * on what they're said to be on (or the nearest table); relations nudge things beside / in front of each other.
 */
export function layout(plan: ScenePlan): Placement[] {
  const out = new Map<string, Placement>();
  const boxes: Box[] = [];
  const indoor = plan.setting.indoor;
  const halfW = indoor ? ROOM.width / 2 - 0.3 : ROOM.outdoorRadius;
  const backZ = indoor ? -ROOM.depth / 2 + 0.05 : -ROOM.outdoorRadius * 0.7;
  const byId = new Map(plan.objects.map((o) => [o.id, o]));
  const footprint = (o: PlanObject): [number, number] => { const e = entryOf(o.kind); return [e.fp[0] * o.scale, e.fp[1] * o.scale]; };
  const facingCenter = (x: number, z: number) => Math.atan2(-x, -z + 0.6);

  const shore = !indoor && plan.setting.water ? -1.15 : -Infinity; // by water, land things stay on the near shore
  // Outdoors, a house (or barn, or chapel) is one thing: its own door and windows come with it, and the way to its
  // door stays open, so nothing tall stands in front of it.
  const backdrops = indoor ? [] : plan.objects.filter((o) => entryOf(o.kind).place === 'backdrop');
  const keepClear: Box[] = [];
  const tallOf = (o: PlanObject) => entryOf(o.kind).h * o.scale >= 1.5;
  const free = (b: Box, tall = false) => !boxes.some((o) => overlaps(o, b)) && !(tall && keepClear.some((o) => overlaps(o, b, 0)))
    && Math.abs(b.x) + b.w / 2 <= halfW + 0.6 && b.z - b.d / 2 >= Math.max(backZ - 0.05, shore) && b.z + b.d / 2 <= 2.3;
  const settle = (o: PlanObject, x0: number, z0: number): Box => {
    const [w, d] = footprint(o);
    const seed = hashStr(o.id);
    const tall = tallOf(o);
    for (let i = 0; i < 140; i++) {
      const a = i * 2.399 + (seed % 7);
      const r = i === 0 ? 0 : 0.18 * Math.sqrt(i);
      const b = { id: o.id, x: x0 + Math.cos(a) * r, z: z0 + Math.sin(a) * r * 0.75, w, d };
      if (free(b, tall)) return b;
    }
    return { id: o.id, x: x0, z: z0, w, d };
  };
  // The house first: everything else keeps clear of its walls.
  for (const o of backdrops) {
    const e = entryOf(o.kind);
    const byWater = plan.setting.water;
    // By water it stands on the shore to one side, turned toward you, so the water stays open; elsewhere it stands
    // behind the place, facing you.
    const s = o.scale * (byWater ? 0.7 : 1);
    const x = byWater ? -6.8 : 0, z = byWater ? -1.6 : backZ - (e.fp[1] * s) / 2 - 1.2;
    const yaw = byWater ? Math.PI / 2 - 0.5 : 0;
    out.set(o.id, { id: o.id, x, y: 0, z, yaw, scale: s, on: null });
    const span = Math.max(e.fp[0], e.fp[1]) * s;
    boxes.push({ id: o.id, x, z, w: byWater ? span : e.fp[0] * s + 0.6, d: byWater ? span : e.fp[1] * s + 0.6 });
    if (!byWater) keepClear.push({ id: `${o.id}-path`, x, z: z + (e.fp[1] * s) / 2 + 2.4, w: 2.6, d: 4.6 });
  }

  // 1. Under-things (rugs, blankets) in the middle.
  for (const o of plan.objects.filter((o) => entryOf(o.kind).place === 'floor-under')) {
    const [ax, az] = ZONE_ANCHOR[o.zone === 'center' ? 'center' : o.zone];
    out.set(o.id, { id: o.id, x: ax * 0.6, y: 0.002, z: az * 0.6, yaw: 0, scale: o.scale, on: null });
  }
  // 2. Things mounted on the back wall (windows, doors, clocks, pictures), spread along it.
  const mounted = plan.objects.filter((o) => entryOf(o.kind).place === 'wall-mounted' && !(backdrops.length && !indoor));
  mounted.forEach((o, i) => {
    const n = mounted.length;
    const x = n === 1 ? 0 : -halfW * 0.62 + (i * (halfW * 1.24)) / (n - 1);
    // y is where the object's own foot sits: a door on the floor, a window sill at 0.85 m, pictures and clocks higher.
    const y = o.kind === 'door' ? 0 : o.kind === 'window' ? 0.85 : 1.4;
    out.set(o.id, { id: o.id, x, y, z: backZ + 0.04, yaw: 0, scale: o.scale, on: null });
  });
  // 3. Furniture against walls: the nearest free stretch of the back wall to where it belongs, else along a side
  //    wall (turned to face into the room), so nothing stands in front of anything else.
  const wallers = plan.objects.filter((o) => entryOf(o.kind).place === 'wall' || o.relation === 'against_wall');
  const sideZ0 = backZ + 0.5, sideZ1 = indoor ? backZ + ROOM.depth * 0.62 : 1.0;
  for (const o of wallers) {
    const [w, d] = footprint(o);
    const want = o.zone.includes('left') ? -halfW * 0.5 : o.zone.includes('right') ? halfW * 0.5 : 0;
    let placed: { b: Box; yaw: number } | null = null;
    for (let i = 0; i < 80 && !placed; i++) {
      const x = want + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.12;
      if (Math.abs(x) + w / 2 > halfW + 0.05) continue;
      const b: Box = { id: o.id, x, z: backZ + d / 2 + 0.06, w, d };
      if (free(b)) placed = { b, yaw: 0 };
    }
    // Side walls: the footprint turns, so width runs along z.
    const sides = o.zone.includes('right') ? [1, -1] : [-1, 1];
    for (const side of sides) {
      for (let z = sideZ0 + w / 2; !placed && z <= sideZ1 - w / 2; z += 0.12) {
        const b: Box = { id: o.id, x: side * (halfW - d / 2 + 0.05), z, w: d, d: w };
        if (free(b)) placed = { b, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 };
      }
    }
    if (!placed) placed = { b: settle(o, want, backZ + d / 2 + 0.5), yaw: 0 };
    boxes.push(placed.b);
    out.set(o.id, { id: o.id, x: placed.b.x, y: 0, z: placed.b.z, yaw: placed.yaw, scale: o.scale, on: null });
  }
  // 4. Fences and railings frame the place: down its sides when a house stands behind it, else along the back.
  //    Never across the front, where they'd hide everything behind them.
  const edges = plan.objects.filter((o) => entryOf(o.kind).place === 'edge' && !out.has(o.id));
  edges.forEach((o, i) => {
    const [w] = footprint(o);
    if (backdrops.length || edges.length > 1) {
      const side = (i % 2 ? 1 : -1) * (o.zone.includes('right') ? -1 : 1) * -1;
      const x = side * (halfW * 0.66), z = -1.2 - Math.floor(i / 2) * (w + 0.3);
      boxes.push({ id: o.id, x, z, w: 0.3, d: w });
      out.set(o.id, { id: o.id, x, y: 0, z, yaw: Math.PI / 2, scale: o.scale, on: null });
    } else {
      const b = settle(o, 0, backZ + 0.35);
      boxes.push(b);
      out.set(o.id, { id: o.id, x: b.x, y: 0, z: b.z, yaw: 0, scale: o.scale, on: null });
    }
  });
  // 5. Rows of seats that face one thing (chapel pews, classroom desks): an aisle down the middle, facing the front.
  const seats = plan.objects.filter((o) => (o.kind === 'bench' || (o.kind === 'chair' && !o.target)) && !out.has(o.id) && o.relation !== 'on');
  if (indoor && seats.length >= 3 && /chapel|church|classroom|school|theat|cinema|hall|lecture|auditorium/.test(plan.setting.type)) {
    seats.forEach((o, i) => {
      const [w, d] = footprint(o);
      const col = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const b: Box = { id: o.id, x: col * (w / 2 + 0.55), z: -0.55 + row * (d + 0.75), w, d };
      boxes.push(b);
      out.set(o.id, { id: o.id, x: b.x, y: 0, z: b.z, yaw: Math.PI, scale: o.scale, on: null });
    });
  }
  // 6. Freestanding floor things: tables first (others relate to them), then the rest, by zone.
  const floorers = plan.objects.filter((o) => ['floor', 'water'].includes(entryOf(o.kind).place) && !out.has(o.id) && o.relation !== 'on');
  floorers.sort((a, b) => Number(b.kind.includes('table')) - Number(a.kind.includes('table')));
  for (const o of floorers) {
    const e = entryOf(o.kind);
    const target = o.target ? out.get(o.target) : undefined;
    let x0: number, z0: number;
    if (e.place === 'water') { x0 = indoor ? 0 : 1.3; z0 = -1.1 - entryOf(o.kind).fp[1] * o.scale / 2; }
    else if (target && (o.relation === 'next_to' || o.relation === 'none')) {
      const t = byId.get(o.target!);
      const [tw] = t ? footprint(t) : [1, 1];
      const side = hashStr(o.id) % 2 ? 1 : -1;
      x0 = target.x + side * (tw / 2 + footprint(o)[0] / 2 + 0.15); z0 = target.z + (o.kind === 'chair' ? 0.35 : 0);
    } else if (target && o.relation === 'in_front_of') { x0 = target.x; z0 = target.z + 1.1; }
    else if (target && o.relation === 'behind') { x0 = target.x; z0 = target.z - 1.0; }
    else {
      // Tall things (trees, lamp posts, a swing frame) never stand in front: they frame the place from the sides
      // and the back, so the view into the memory stays open.
      const tall = e.h * o.scale >= 2.0;
      const zone: Zone = tall ? (({ 'front-left': 'left', 'front-right': 'right', center: 'back' } as Partial<Record<Zone, Zone>>)[o.zone] ?? o.zone) : o.zone;
      [x0, z0] = ZONE_ANCHOR[zone];
      if (!indoor) { x0 *= 1.25; z0 *= 1.25; }
      const side = (x: number) => (x === 0 ? (hashStr(o.id) % 2 ? 1 : -1) : Math.sign(x));
      if (tall && !indoor && /tree|palm|pine/.test(o.kind)) {
        // Trees frame the place from its sides and back, clear of the house; by water they keep to the shore (and
        // to the open side, away from a house there).
        const away = plan.setting.water && backdrops.length ? 1 : side(x0);
        if (Math.abs(x0) < 3.6) x0 = away * (3.8 + (hashStr(o.id) % 3) * 0.5);
        z0 = plan.setting.water ? -0.4 + (hashStr(o.id) % 4) * 0.35 : Math.min(z0, -1.6);
      } else if (tall && !indoor && backdrops.length) {
        // A swing, a lamp post, an umbrella: beside the house's front, never in front of its door.
        if (Math.abs(x0) < 2.4) x0 = side(x0) * 2.6;
      }
    }
    const onWater = e.place === 'water' && !indoor;
    // On the water: beside whatever is already there, toward the open middle first (a boat alongside the dock).
    const b = onWater ? (() => { const [w, d] = footprint(o); let bx: Box = { id: o.id, x: x0, z: z0, w, d }; for (let i = 1; i < 20 && boxes.some((q) => overlaps(q, bx)); i++) bx = { ...bx, x: x0 + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 1.1, z: z0 - 0.4 }; return bx; })() : settle(o, x0, z0);
    boxes.push(b);
    let yaw = onWater ? 0 : facingCenter(b.x, b.z);
    if (o.kind === 'chair' && target) yaw = Math.atan2(target.x - b.x, target.z - b.z);
    out.set(o.id, { id: o.id, x: b.x, y: o.kind === 'kite' ? 1.0 : 0, z: b.z, yaw, scale: o.scale, on: null }); // a kite flies (its tail hangs below)
  }
  // 7. Things that rest on something: on their target, else on the first table/counter/cabinet. A small thing said
  //    to be in front of, beside or behind something it can't rest on ("a TV in front of the bed") stands there
  //    instead, turned toward it, rather than being tidied away onto the nearest shelf.
  const surfaces = plan.objects.filter((o) => (entryOf(o.kind).surface ?? 0) > 0 && out.has(o.id));
  const stacked = new Map<string, number>();
  for (const o of plan.objects.filter((o) => !out.has(o.id))) {
    const tp = o.target ? out.get(o.target) : undefined;
    const t = o.target ? byId.get(o.target) : undefined;
    if (tp && t && !(entryOf(t.kind).surface ?? 0) && ['in_front_of', 'next_to', 'behind'].includes(o.relation)) {
      const [tw, td] = footprint(t);
      const [w, d] = footprint(o);
      const fx = Math.sin(tp.yaw), fz = Math.cos(tp.yaw); // the target's front (yaw 0 faces the viewer)
      const away = o.relation === 'next_to' ? 0 : (td / 2 + 0.85 + d / 2) * (o.relation === 'behind' ? -1 : 1);
      const side = o.relation === 'next_to' ? (tw / 2 + 0.3 + w / 2) * (hashStr(o.id) % 2 ? 1 : -1) : 0;
      const b = settle(o, tp.x + fx * away + fz * side, tp.z + fz * away - fx * side);
      boxes.push(b);
      out.set(o.id, { id: o.id, x: b.x, y: 0, z: b.z, yaw: Math.atan2(tp.x - b.x, tp.z - b.z), scale: o.scale, on: null });
      continue;
    }
    const host = (o.target && surfaces.find((s) => s.id === o.target)) || surfaces.find((s) => s.kind.includes('table')) || surfaces[0];
    if (host) {
      const hp = out.get(host.id)!;
      const he = entryOf(host.kind);
      const n = stacked.get(host.id) ?? 0;
      stacked.set(host.id, n + 1);
      const spread = Math.min(he.fp[0] * host.scale * 0.32, 0.5);
      const ox = n === 0 ? 0 : (n % 2 ? 1 : -1) * spread * Math.ceil(n / 2) * 0.7;
      out.set(o.id, { id: o.id, x: hp.x + Math.cos(hp.yaw) * ox, y: (he.surface ?? he.h) * host.scale, z: hp.z - Math.sin(hp.yaw) * ox + (host.kind === 'bookshelf' ? 0.02 : 0), yaw: hp.yaw, scale: o.scale, on: host.id });
    } else {
      const b = settle(o, ZONE_ANCHOR[o.zone][0] * 0.5, ZONE_ANCHOR[o.zone][1] * 0.5);
      boxes.push(b);
      out.set(o.id, { id: o.id, x: b.x, y: 0, z: b.z, yaw: facingCenter(b.x, b.z), scale: o.scale, on: null });
    }
  }
  return plan.objects.map((o) => out.get(o.id)!).filter(Boolean);
}

export const PLAN_SYSTEM = `You turn someone's spoken description of a remembered place into a plan for a gentle 3D sketch of it. The person may be living with early dementia; their words are precious and may be partial or uncertain. Draw what they said; add only quiet, plausible context the setting needs (a kitchen has a counter), never people, never invented personal history, never text or signs.

Return JSON only, matching the schema:
- title: a warm short name for the place in the speaker's terms ("Grandma's kitchen", "The lake at dusk"), at most 5 words.
- setting: indoor (true/false); type (one or two plain words: kitchen, living room, garden, beach, lake, porch, park, street, classroom, café...); timeOfDay (morning|midday|golden|dusk|night) from their words, else golden; weather (clear|soft|rain|snow|mist); floor (wood|tile|carpet|grass|sand|stone|snow|water); palette: up to 3 hex colours they mentioned or that the place clearly has; walls (true for rooms); water (true for beaches, lakes, rivers).
- ambience: dust (sunny rooms), petals, snow, fireflies (summer nights), rain, leaves, or none.
- objects: 3 to 12 physical things, mentioned ones first. For each: id (short, unique, lowercase, e.g. "table", "chair-2"); kind (one of the library keys listed below, else "custom"); label (2-4 plain words, the speaker's own noun, e.g. "yellow curtains"); color (hex, only if said or obvious, else null); material (wood|fabric|metal|ceramic|glass|paper|plant|stone|plastic|water|light, or null); zone (center|back|left|right|back-left|back-right|front-left|front-right); relation (on|next_to|under|in_front_of|behind|against_wall|none) and target (the id it relates to, else null); scale (1 = ordinary size, 0.6-1.6); quote (the exact words that mention it, else null).
- intro: the companion's first words once the place appears: present tense, at most 22 words, gently naming one or two remembered details. Never ask them to remember anything.

Library keys: ${LIBRARY_KEYS.join(', ')}.
Use "custom" only for things none of these can stand for. Put small things (cups, radio, books, vase, lamp, cake) "on" a table, counter, shelf, cabinet or fireplace.`;
