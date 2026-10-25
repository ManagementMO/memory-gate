// Prepared places: worlds the team made once (World Labs, cached in the repo) that a visit can step into when the
// person's words describe one, instead of a sketch. Things named in the conversation are then brought in from the
// object library, each to a spot chosen for that world, so the place fills in as it's talked about, instantly and for
// free. Shown as a place from the library: never presented as the person's own photograph.
// Spots are metres in the world's own frame, with the visitor at its origin (the world's camera): x right and z back
// as seen from that camera, y up from the floor. `view` turns the visitor to face the place's best side.
import { COLORS, planOffline, type PlanObject, type ScenePlan } from './scene';

const COLOUR_WORDS = Object.keys(COLORS).sort((a, b) => b.length - a.length).join('|');
const SHADE = '(?:(?:a|all|so|very|quite|bright|light|dark|deep|pale) )*';
/** A colour said after the thing, in the same breath ("the kite was red", "a kite, bright red", "the kite's red"). */
function colourAfter(plain: string, label: string): string | null {
  const m = plain.match(new RegExp(`\\b${label}(?:'s)? (?:(?:it|that|which) )?(?:(?:was|is|were|looked) )?${SHADE}(${COLOUR_WORDS})\\b`));
  return m ? COLORS[m[1]!] ?? null : null;
}

export type PlaceKey = 'courtyard' | 'red-kite';
/** `on`: rests on that kind of thing; `of`: belongs around it (chairs at a table). Both move with it. */
export type Spot = { x: number; z: number; y?: number; yaw?: number; on?: string; of?: string };
/** Something in the world itself that people place things by ("by the oak", "under the pergola"). */
export type Landmark = { words: RegExp; x: number; z: number };
/** Where "on the left", "on the right", "at the far end" and "up close" put things, in this world's frame. */
export type Areas = Record<'left' | 'right' | 'far' | 'near', [number, number]>;

export type PreparedPlace = {
  key: PlaceKey;
  title: string;
  /** A word that calls it up on its own ("courtyard"), or enough of its details together (two of them). */
  callWords: RegExp;
  detailWords: RegExp[];
  intro: string;
  setting: ScenePlan['setting'];
  /** How far to turn from the world camera's own direction (-z) to face the place's best side (radians, about y). */
  view: number;
  /** On flat screens, step back (metres) and look down a little (metres at the look point) so near things show. */
  flat?: { back: number; down: number };
  /** Where each kind of thing goes unless the person says where, in order of arrival. */
  spots: Record<string, Spot[]>;
  landmarks: Landmark[];
  areas: Areas;
};

export const PLACES: Record<PlaceKey, PreparedPlace> = {
  courtyard: {
    key: 'courtyard',
    title: 'The courtyard',
    callWords: /\bcourt ?yards?\b/,
    detailWords: [/\bpergola\b/, /\bgrape ?(vine)?s?\b|\bvines?\b/, /\bshutters?\b/, /\blimestone\b/, /\bstone (paving|floor|tiles)\b|\bpaving\b/],
    intro: 'Here we are. The vines over the pergola, and the warm stone.',
    setting: { indoor: false, type: 'courtyard', timeOfDay: 'golden', weather: 'clear', floor: 'stone', palette: [], walls: false, water: false },
    // The world's own camera faces a corner; the courtyard opens behind it, down the length of the pergola.
    view: Math.PI,
    spots: {
      table: [{ x: 0, z: 2.9 }],
      round_table: [{ x: 0, z: 2.9 }],
      chair: [{ x: -0.85, z: 2.9, yaw: Math.PI / 2, of: 'table' }, { x: 0.85, z: 2.9, yaw: -Math.PI / 2, of: 'table' }, { x: 0, z: 3.75, yaw: Math.PI, of: 'table' }],
      teapot: [{ x: -0.25, z: 2.85, on: 'table' }],
      cup: [{ x: 0.05, z: 2.7, on: 'table' }, { x: 0.15, z: 3.05, on: 'table' }],
      bowl_fruit: [{ x: 0.3, z: 2.95, on: 'table' }],
      cake: [{ x: 0.05, z: 3.0, on: 'table' }],
      lamp: [{ x: 0.5, z: 3.1, on: 'table' }],
      candle: [{ x: -0.5, z: 3.05, on: 'table' }],
      books: [{ x: 0.45, z: 2.7, on: 'table' }],
      radio: [{ x: 0.55, z: 2.75, on: 'table' }],
      bench: [{ x: -1.5, z: 2.2, yaw: Math.PI / 2 }],
      potted_plant: [{ x: -1.55, z: 3.5 }, { x: 1.35, z: 4.4 }],
      flowers: [{ x: -1.3, z: 1.6, yaw: Math.PI / 2 }],
    },
    landmarks: [
      { words: /\bpergola\b|\bvines?\b|\bgrapes?\b|\bbeams?\b/, x: 0.35, z: 3.6 },
      { words: /\bwalls?\b|\bshutters?\b|\bwindows?\b/, x: -1.35, z: 3.3 },
      { words: /\bdoors?\b|\bdoorway\b|\bentrance\b/, x: 0.5, z: 6.2 },
    ],
    areas: { left: [1.15, 3.2], right: [-1.25, 3.2], far: [0.1, 5.6], near: [0.2, 1.7] },
  },
  'red-kite': {
    key: 'red-kite',
    title: 'The meadow with the kite',
    // "This hill", a meadow, the red kite: each calls it up on its own (it's the library's open-country place).
    callWords: /\bred kite\b|\bmeadow\b|\bhill ?(side|top)?s?\b/,
    detailWords: [/\bkites?\b/, /\bfield\b|\bclearing\b|\bgrass\b/, /\boak\b/, /\b(dirt )?path\b/, /\bflowers\b|\bpoppies\b/],
    intro: 'Here we are. The little path, and the old oak at the bend.',
    setting: { indoor: false, type: 'meadow', timeOfDay: 'golden', weather: 'clear', floor: 'grass', palette: [], walls: false, water: false },
    view: 0,
    // The spool and keepsake box wait within arm's reach (for the headset); a flat screen steps back to see them.
    flat: { back: 0.9, down: 0.35 },
    // The team's Red Kite props where the Red Kite story keeps them (checked in this meadow from both tellings).
    spots: {
      kite: [{ x: 0, z: 0 }], // flown from the visitor's own hands (HeldKite), never set in the place
      side_table: [{ x: -0.55, z: -0.7, yaw: 0 }],
      spool: [{ x: -0.5, z: -0.66, on: 'side_table' }],
      keepsake_box: [{ x: -0.74, z: -0.77, on: 'side_table' }],
      story_card: [{ x: -0.36, z: -0.62, on: 'side_table' }],
      bench: [{ x: 1.5, z: -2.4, yaw: -Math.PI / 3 }, { x: -1.4, z: -2.7, yaw: Math.PI / 3 }, { x: 0.3, z: -4.6 }],
      picnic_blanket: [{ x: 0.9, z: -1.6 }],
      bowl_fruit: [{ x: 0.9, z: -1.6, y: 0.04 }],
    },
    // The old oak at the bend (Rosa's telling stands beside it), the path running ahead, the open hill beyond.
    landmarks: [
      { words: /\boak\b|\btree\b|\bshade\b/, x: -1.7, z: -3.4 },
      { words: /\bpath\b|\btrail\b|\bdirt road\b|\bbend\b/, x: 0.75, z: -2.8 },
      { words: /\bhill\b|\bhilltop\b|\bslope\b|\bclearing\b/, x: 0.4, z: -5.5 },
    ],
    areas: { left: [-1.7, -2.3], right: [1.7, -2.3], far: [0.3, -5.2], near: [0.9, -1.5] },
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");

/** How far a visit in this place turns to face its best side (0 outside prepared places). */
export const viewOf = (key: PlaceKey | null | undefined) => (key ? PLACES[key].view : 0);
/** A point in front of the visitor (x right, z back), turned to face the place's best side. */
export function turned(x: number, z: number, view: number): [number, number] {
  const c = Math.cos(view), s = Math.sin(view);
  return [x * c + z * s, -x * s + z * c];
}

/** The prepared place these words describe, if any (a call word, or two of its details). */
export function placeFor(words: string): PreparedPlace | null {
  const t = norm(words);
  for (const p of Object.values(PLACES)) {
    if (p.callWords.test(t) || p.detailWords.filter((w) => w.test(t)).length >= 2) return p;
  }
  return null;
}

/** The plan a prepared place starts from: its name and light, nothing in it yet (the world itself is the place). */
export function placePlan(p: PreparedPlace, title?: string | null): ScenePlan {
  return { version: 1, title: title || p.title, setting: p.setting, ambience: 'none', objects: [], intro: p.intro };
}

/** Where these words put a thing in this place, if they say: a pointed spot ("here"), a landmark ("by the oak"),
 *  something already there ("next to the bench"), or an area ("on the left"). */
function saidWhere(p: PreparedPlace, plan: ScenePlan, words: string, kind: string, pointed: [number, number] | null): [number, number] | null {
  const first = p.spots[kind]?.[0];
  if (first?.on || first?.of) return null; // it goes with what it rests on or belongs around
  const t = norm(words);
  if (pointed && /\b(here|there|right here|over there|this spot)\b/.test(t)) return pointed;
  for (const l of p.landmarks) if (new RegExp(`\\b(by|near|under|beside|next to|at|against|along|beneath|in front of|on) (the |a |that |this |our |her |his )?(old |big |little |tall |stone |wooden |green )?${l.words.source}`).test(t)) return [l.x, l.z];
  for (const o of plan.objects) {
    if (o.kind === kind) continue;
    const at = whereIs(p, plan, o);
    if (at && new RegExp(`\\b(by|near|beside|next to|against|in front of) (the |a |her |his |our )?${o.label.split(' ').pop()}`).test(t)) return [at[0] + 0.75, at[1] + 0.35];
  }
  if (/\b(on|to) the left\b|\bleft side\b/.test(t)) return p.areas.left;
  if (/\b(on|to) the right\b|\bright side\b/.test(t)) return p.areas.right;
  if (/\b(far|back|end|distance|further)\b/.test(t)) return p.areas.far;
  if (/\b(close|near me|up front|in front)\b/.test(t)) return p.areas.near;
  return null;
}

const hostKinds = (kind: string) => (kind === 'table' ? ['table', 'round_table'] : [kind]);

/** Where a thing in this place is: where it was put, else its kind's spot; things on or around something move with
 *  it, keeping their place relative to it. */
export function whereIs(p: PreparedPlace, plan: ScenePlan, o: PlanObject, depth = 0): [number, number] | null {
  const s = spotOf(p, plan, o);
  if (!s) return null;
  const hostKind = s.on ?? s.of;
  if (hostKind && depth < 3) {
    const host = plan.objects.find((h) => hostKinds(hostKind).includes(h.kind));
    const hostAt = host ? whereIs(p, plan, host, depth + 1) : null;
    const hostSpot = host ? spotOf(p, plan, host) : null;
    if (hostAt && hostSpot) return [hostAt[0] + s.x - hostSpot.x, hostAt[1] + s.z - hostSpot.z];
  }
  if (o.at) return o.at;
  return [s.x, s.z];
}

/**
 * The things these words name that this place has a spot for, brought in where the words say (or to their spots),
 * and things already there moved when the words put them somewhere ("the bench was by the oak", pointing at the
 * ground and saying "the table was here"). Chairs come in as many as were said. Returns null when nothing changed.
 */
export function bringIn(p: PreparedPlace, plan: ScenePlan, words: string, pointed: [number, number] | null = null): ScenePlan | null {
  const named = planOffline(words, plan.title, { seeds: false }).objects.filter((o) => p.spots[o.kind]);
  const added: PlanObject[] = [];
  let objects = plan.objects;
  const plain = norm(words).replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  for (const o of named) {
    const have = [...objects, ...added].filter((x) => x.kind === o.kind).length;
    const many = /\b(two|both|pair|couple)\b/.test(norm(words)) || /s$/.test(o.label) ? 2 : 1;
    const room = Math.min(p.spots[o.kind]!.length, many) - have;
    const where = saidWhere(p, { ...plan, objects: [...objects, ...added] }, words, o.kind, pointed);
    const color = o.color ?? colourAfter(plain, o.label);
    if (room <= 0) {
      // Already there: words that place it move it, and a colour said now ("the kite was red") is its colour.
      const first = objects.find((y) => y.kind === o.kind);
      if (where || (color && color !== first?.color)) objects = objects.map((x) => (x === first ? { ...x, ...(where ? { at: where } : {}), ...(color ? { color } : {}) } : x));
      continue;
    }
    for (let i = 0; i < room; i++) added.push({ ...o, color, id: `${o.kind}-${have + i + 1}`, quote: o.quote ?? words.slice(0, 120), ...(where ? { at: [where[0] + i * 0.7, where[1]] as [number, number] } : {}) });
  }
  // "It was red": the colour of the thing just talked about.
  // (Only as the whole sentence, so "it was so green there" stays about the place.)
  const it = !named.length ? plain.match(new RegExp(`^(?:(?:and|oh|yes|yeah|well|so|i think) )*(?:it|that|this)(?: one)?(?:'s | was | is | were | looked )(?:(?:a|bright|light|dark|deep|pale) )*(${COLOUR_WORDS})(?: (?:one|colou?r))?$`)) : null;
  const last = it ? [...objects].reverse().find((x) => p.spots[x.kind]) : undefined;
  if (it && last && COLORS[it[1]!] !== last.color) objects = objects.map((x) => (x === last ? { ...x, color: COLORS[it[1]!]! } : x));
  // Things that rest on something bring it with them (a teapot its table, a spool its little table).
  for (const o of [...added]) {
    const on = p.spots[o.kind]?.[0]?.on ?? p.spots[o.kind]?.[0]?.of;
    const hosts = on === 'table' ? ['table', 'round_table'] : on ? [on] : [];
    if (!on || [...objects, ...added].some((x) => hosts.includes(x.kind))) continue;
    added.unshift({ id: `${on}-1`, kind: on, label: on.replace('_', ' '), color: null, material: null, zone: 'center', relation: 'none', target: null, scale: 1, quote: null });
  }
  if (!added.length && objects === plan.objects) return null;
  return { ...plan, objects: [...objects, ...added].slice(0, 16) };
}

/** Where a thing in a prepared place stands: its kind's next spot, by its order among things of that kind. */
export function spotOf(p: PreparedPlace, plan: ScenePlan, o: PlanObject): Spot | null {
  const list = p.spots[o.kind];
  if (!list) return null;
  const index = plan.objects.filter((x) => x.kind === o.kind).findIndex((x) => x.id === o.id);
  return list[Math.max(0, index)] ?? null;
}
