// Prepared places: worlds the team made once (World Labs, cached in the repo) that a visit can step into when the
// person's words describe one, instead of a sketch. Things named in the conversation are then brought in from the
// object library, each to a spot chosen for that world, so the place fills in as it's talked about, instantly and for
// free. Shown as a place from the library: never presented as the person's own photograph.
// Spots are metres in the world's own frame, with the visitor at its origin (the world's camera): x right and z back
// as seen from that camera, y up from the floor. `view` turns the visitor to face the place's best side.
import { planOffline, type PlanObject, type ScenePlan } from './scene';

export type PlaceKey = 'courtyard' | 'red-kite';
export type Spot = { x: number; z: number; y?: number; yaw?: number; on?: string };

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
  /** Where each kind of thing goes, in order of arrival (a second chair takes the second chair spot). */
  spots: Record<string, Spot[]>;
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
      chair: [{ x: -0.85, z: 2.9, yaw: Math.PI / 2 }, { x: 0.85, z: 2.9, yaw: -Math.PI / 2 }, { x: 0, z: 3.75, yaw: Math.PI }],
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
  },
  'red-kite': {
    key: 'red-kite',
    title: 'The meadow with the kite',
    callWords: /\bred kite\b/,
    detailWords: [/\bkites?\b/, /\bmeadow\b|\bfield\b|\bclearing\b/, /\boak\b/, /\b(dirt )?path\b/, /\bhills?\b/],
    intro: 'Here we are. The little path, and the old oak at the bend.',
    setting: { indoor: false, type: 'meadow', timeOfDay: 'golden', weather: 'clear', floor: 'grass', palette: [], walls: false, water: false },
    view: 0,
    // The spool and keepsake box wait within arm's reach (for the headset); a flat screen steps back to see them.
    flat: { back: 0.9, down: 0.35 },
    // The team's Red Kite props where the Red Kite story keeps them (checked in this meadow from both tellings).
    spots: {
      // Its tail hangs 1.45 m below the sail, so the sail flies at about 2.3 m.
      kite: [{ x: 0.25, z: -2.4, y: 0.85 }],
      side_table: [{ x: -0.55, z: -0.7, yaw: 0 }],
      spool: [{ x: -0.5, z: -0.66, on: 'side_table' }],
      keepsake_box: [{ x: -0.74, z: -0.77, on: 'side_table' }],
      story_card: [{ x: -0.36, z: -0.62, on: 'side_table' }],
      bench: [{ x: 1.5, z: -2.4, yaw: -Math.PI / 3 }],
      picnic_blanket: [{ x: 0.9, z: -1.6 }],
      bowl_fruit: [{ x: 0.9, z: -1.6, y: 0.04 }],
    },
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

/**
 * The things these words name that this place has a spot for, added to the plan (each kind once, chairs as many as
 * were said, up to the spots there are). Returns null when nothing new was named.
 */
export function bringIn(p: PreparedPlace, plan: ScenePlan, words: string): ScenePlan | null {
  const named = planOffline(words, plan.title, { seeds: false }).objects.filter((o) => p.spots[o.kind]);
  const added: PlanObject[] = [];
  for (const o of named) {
    const have = [...plan.objects, ...added].filter((x) => x.kind === o.kind).length;
    const many = /\b(two|both|pair|couple)\b/.test(norm(words)) || /s$/.test(o.label) ? 2 : 1;
    const room = Math.min(p.spots[o.kind]!.length, many) - have;
    for (let i = 0; i < room; i++) added.push({ ...o, id: `${o.kind}-${have + i + 1}`, quote: o.quote ?? words.slice(0, 120) });
  }
  // Things that rest on something bring it with them (a teapot its table, a spool its little table).
  for (const o of [...added]) {
    const on = p.spots[o.kind]?.[0]?.on;
    const hosts = on === 'table' ? ['table', 'round_table'] : on ? [on] : [];
    if (!on || [...plan.objects, ...added].some((x) => hosts.includes(x.kind))) continue;
    added.unshift({ id: `${on}-1`, kind: on, label: on.replace('_', ' '), color: null, material: null, zone: 'center', relation: 'none', target: null, scale: 1, quote: null });
  }
  if (!added.length) return null;
  return { ...plan, objects: [...plan.objects, ...added].slice(0, 16) };
}

/** Where a thing in a prepared place stands: its kind's next spot, by its order among things of that kind. */
export function spotOf(p: PreparedPlace, plan: ScenePlan, o: PlanObject): Spot | null {
  const list = p.spots[o.kind];
  if (!list) return null;
  const index = plan.objects.filter((x) => x.kind === o.kind).findIndex((x) => x.id === o.id);
  return list[Math.max(0, index)] ?? null;
}
