// San Francisco memories shared publicly: the world map's San Francisco, pinned where each was made. They are fictional
// demonstration samples (made from demo photographs; the people and their words are invented) and say so where shown.
// Each is a plan the memory engine draws (the place, the things, the people the photo shows, the landmark on the
// horizon), so stepping into one is the same as stepping back into your own. Twelve were made at the Golden Gate:
// there, the bridge is a place of its own where everyone who kept a memory stands, and pointing at someone steps into theirs.
// The photographs are prepared by apps/gate/scripts/prepare-sf-photos.mjs (from /photos, not kept in git).
import type { PlanLandmark, PlanObject, PlanPerson, Relation, ScenePlan, TimeOfDay, Weather, Floor, Zone, PersonAge, PersonPose } from '../../../../packages/shared/src/scene';

export type SfPlace = { id: string; name: string; lat: number; lng: number };
export type SfMemory = {
  id: string; place: string; lat: number; lng: number;
  owner: string; title: string; words: string[]; when: string;
  photo: string; crowd: boolean; plan: ScenePlan;
};

export const SF_PLACES: Record<string, SfPlace> = {
  golden_gate: { id: 'golden_gate', name: 'Golden Gate Bridge', lat: 37.8199, lng: -122.4783 },
  palace: { id: 'palace', name: 'Palace of Fine Arts', lat: 37.8029, lng: -122.4484 },
  alamo: { id: 'alamo', name: 'Alamo Square', lat: 37.7764, lng: -122.4346 },
  baker: { id: 'baker', name: 'Baker Beach', lat: 37.7936, lng: -122.4836 },
  telegraph: { id: 'telegraph', name: 'Telegraph Hill', lat: 37.8010, lng: -122.4048 },
  chinatown: { id: 'chinatown', name: 'Chinatown', lat: 37.7941, lng: -122.4064 },
  northbeach: { id: 'northbeach', name: 'North Beach', lat: 37.7986, lng: -122.4074 },
};

// ---- small builders so each memory reads like the photo it came from ----
type Look = { skin?: string; hair?: string; top?: string; bottom?: string };
const person = (age: PersonAge, gender: 'female' | 'male', pose: PersonPose, look: Look, zone: Zone = 'center', facing = 0, at?: [number, number]): Omit<PlanPerson, 'id'> =>
  ({ age, gender, pose, zone, facing, skin: look.skin ?? null, hair: look.hair ?? null, top: look.top ?? null, bottom: look.bottom ?? null, ...(at ? { at } : {}) });
const thing = (kind: string, label: string, zone: Zone = 'center', color: string | null = null, relation: Relation = 'none', target: string | null = null) => ({ kind, label, zone, color, relation, target });
/** The bridge from where the photo was taken: which way, how far, how it lies, and how high above the water you stand. */
const gate = (bearing: number, distance: number, yaw: number, above = 0): PlanLandmark => ({ id: 'golden_gate', bearing, distance, yaw, ...(above ? { above } : {}) });

function plan(p: {
  title: string; type: string; indoor?: boolean; time: TimeOfDay; weather?: Weather; floor: Floor; water?: boolean; palette?: string[];
  things: ReturnType<typeof thing>[]; people: Omit<PlanPerson, 'id'>[]; landmark?: PlanLandmark; intro: string;
  showcase?: { name: string; camera?: number };
}): ScenePlan {
  const objects: PlanObject[] = p.things.map((t, i) => ({ id: `${t.kind}-${i}`, kind: t.kind, label: t.label, color: t.color, material: null, zone: t.zone, relation: t.relation, target: t.target, scale: 1, quote: null }));
  return {
    version: 1, title: p.title,
    setting: { indoor: !!p.indoor, type: p.type, timeOfDay: p.time, weather: p.weather ?? 'clear', floor: p.floor, palette: p.palette ?? [], walls: !!p.indoor, water: !!p.water },
    ambience: p.indoor ? 'dust' : 'leaves',
    objects,
    people: p.people.map((x, i) => ({ id: `person-${i}`, ...x })),
    ...(p.landmark ? { landmark: p.landmark } : {}),
    ...(p.showcase ? { showcase: p.showcase } : {}),
    intro: p.intro,
  };
}

// skin and hair tones used below
const S = { fair: '#e6c3a8', light: '#e0b99a', tan: '#d9a988', olive: '#c99a7a', brown: '#a8724f', deep: '#8d5a3b', dark: '#6b4a35' };
const H = { black: '#1e1a18', darkBrown: '#2a1f1a', brown: '#5a3c28', auburn: '#6b3420', blonde: '#b08a5a', grey: '#b9bcc4' };
const W = '#f2efe8';

/** The six shared memories, each a finished place (src/showcase/scenes) seen from where the photo was taken, with the
 *  people the photo shows standing in it. Three were made at the Golden Gate. */
const GG = (camera: number) => ({ name: 'golden-gate', camera });
export const SF_MEMORIES: SfMemory[] = [
  {
    id: 'sf:gg-crissy-family', place: 'golden_gate', lat: 37.8059, lng: -122.4648, owner: 'Lucia Garcia', when: 'November 2023', crowd: true,
    title: 'Running on Crissy Field', photo: '/memories/sf/IMG_3672.JPG',
    words: ['Every Sunday after church we let the kids run on the sand at Crissy Field.', 'Mateo raced the waves, and Ana held her dad’s hand and refused to get her shoes wet.'],
    plan: plan({
      title: 'Crissy Field', type: 'beach', time: 'golden', floor: 'sand', water: true, things: [], showcase: GG(0),
      people: [person('adult', 'male', 'walk', { skin: S.tan, hair: '#3a2a20', top: W, bottom: '#2b2b30' }, 'center'), person('adult', 'female', 'walk', { skin: S.olive, hair: H.black, top: '#2f4a3a', bottom: '#2f4a3a' }, 'center'), person('child', 'female', 'walk', { skin: S.olive, hair: H.black, top: '#2f5a3a', bottom: '#2f5a3a' }, 'center'), person('child', 'male', 'walk', { skin: S.olive, hair: H.black, top: '#2f8a8a', bottom: '#2c3e66' }, 'front-left')],
      intro: 'Crissy Field in the late sun, the kids running and the bridge across the water.',
    }),
  },
  {
    id: 'sf:gg-trail', place: 'golden_gate', lat: 37.8282, lng: -122.4808, owner: 'Isabel Moreno', when: 'April 2024', crowd: true,
    title: 'Above the bridge', photo: '/memories/sf/IMG_3660.jpg',
    words: ['We hiked up from Kirby Cove with our hair full of wind.', 'When the whole bridge came into view, the city was lit up behind it like a postcard.'],
    plan: plan({
      title: 'Battery Spencer', type: 'hill', time: 'golden', floor: 'grass', water: true, things: [], showcase: GG(4),
      people: [person('young adult', 'female', 'wait', { skin: S.fair, hair: H.auburn, top: '#6b2734', bottom: '#3a5a8a' }, 'center', 180)],
      intro: 'The headland above the bridge, wind in the grass and the city beyond it.',
    }),
  },
  {
    id: 'sf:gg-three-friends', place: 'golden_gate', lat: 37.8326, lng: -122.4810, owner: 'Daniel Okoye', when: 'May 2024', crowd: true,
    title: 'Three of us and the bay', photo: '/memories/sf/IMG_3668.JPG',
    words: ['Our last weekend before everyone moved away.', 'We stood at the edge and promised to come back every year. We have kept it twice.'],
    plan: plan({
      title: 'Vista Point', type: 'hill', time: 'midday', floor: 'grass', water: true, things: [], showcase: GG(5),
      people: [person('young adult', 'male', 'stand', { skin: S.dark, hair: H.black, top: '#f4f2ee', bottom: '#5a5a62' }, 'center', 180), person('young adult', 'female', 'wait', { skin: S.fair, hair: H.blonde, top: '#2b2b30', bottom: '#3a5a8a' }, 'center', 180), person('young adult', 'female', 'stand', { skin: S.olive, hair: '#3a2a20', top: '#9a9aa2', bottom: '#2b2b30' }, 'center', 180)],
      intro: 'Vista Point in full sun, the whole bay open below the bridge.',
    }),
  },
  {
    id: 'sf:palace-sisters', place: 'palace', lat: 37.8031, lng: -122.4487, owner: 'Mei Chen', when: 'August 2023', crowd: false,
    title: 'White dresses by the lagoon', photo: '/memories/sf/IMG_3650.jpg',
    words: ['My sister and I wore matching white dresses for her birthday.', 'The light came through the rotunda, and the lagoon was so still it held the whole dome.'],
    plan: plan({
      title: 'The Palace of Fine Arts', type: 'lagoon', time: 'golden', floor: 'grass', water: true, things: [], showcase: { name: 'palace-lagoon', camera: 0 },
      people: [person('young adult', 'female', 'stand', { skin: S.light, hair: H.black, top: W, bottom: W }, 'center'), person('young adult', 'female', 'wait', { skin: S.light, hair: H.black, top: '#efe9dc', bottom: '#efe9dc' }, 'center')],
      intro: 'The rotunda glows across the water, and the lagoon holds the dome.',
    }),
  },
  {
    id: 'sf:alamo-postcard', place: 'alamo', lat: 37.7766, lng: -122.4344, owner: 'Priya Nair', when: 'January 2024', crowd: false,
    title: 'Postcard Row', photo: '/memories/sf/IMG_3661.jpg',
    words: ['The first Sunday after I moved here, I walked up to Alamo Square because it is on every postcard.', 'It is even better in person. The houses look like cake.'],
    plan: plan({
      title: 'Alamo Square', type: 'park', time: 'golden', floor: 'grass', things: [], showcase: { name: 'sf-alamo-square', camera: 0 },
      people: [person('young adult', 'female', 'stand', { skin: S.brown, hair: '#2a1d16', top: '#6b2734', bottom: '#2c3e66' })],
      intro: 'Alamo Square in the sun, the Painted Ladies lined up across the street.',
    }),
  },
  {
    id: 'sf:telegraph-hill', place: 'telegraph', lat: 37.8008, lng: -122.4049, owner: 'Sofia Alvarez', when: 'March 2024', crowd: false,
    title: 'Down Green Street', photo: '/memories/sf/IMG_3653.jpg',
    words: ['I lived at the top of the Filbert Steps that year.', 'Every morning I walked down past the bay windows and the cable car bell, and the city was just waking up.'],
    plan: plan({
      title: 'A San Francisco street', type: 'street', time: 'golden', floor: 'stone', things: [], showcase: { name: 'sf-street', camera: 0 },
      people: [person('young adult', 'female', 'stand', { skin: S.tan, hair: '#3a2a20', top: '#efe6d6', bottom: '#f4f2ee' })],
      intro: 'The street in the morning light, bay windows on both sides.',
    }),
  },
];

/** The Golden Gate as a place of its own: you, as yourself, at Crissy Field among the people who kept a memory of the
 *  bridge, each holding their picture. Pointing at someone (a pinch, a click) steps into theirs. */
export const GOLDEN_GATE_CROWD: SfMemory = (() => {
  const here = SF_MEMORIES.filter((m) => m.crowd);
  const people = here.map((m, i): PlanPerson => {
    const first = m.plan.people?.[0];
    const x = (i - (here.length - 1) / 2) * 1.6;
    return {
      age: first?.age ?? 'adult', gender: first?.gender ?? 'female', skin: first?.skin ?? null, hair: first?.hair ?? null, top: first?.top ?? null, bottom: first?.bottom ?? null,
      id: `crowd-${i}`, pose: (['wave', 'stand', 'wait'] as const)[i % 3]!, zone: 'center', facing: -x * 12, at: [x, 0.2 - Math.abs(x) * 0.25], memory: m.id,
    };
  });
  return {
    id: 'sf:golden-gate', place: 'golden_gate', lat: 37.8199, lng: -122.4783, owner: 'Everyone who was here', when: '', crowd: false,
    title: 'The Golden Gate Bridge', photo: '/memories/sf/IMG_3679.JPG',
    words: ['People who kept a memory here. Walk among them, and point at anyone to step into theirs.'],
    plan: { ...plan({ title: 'The Golden Gate Bridge', type: 'beach', time: 'golden', floor: 'sand', water: true, things: [], people: [], showcase: GG(0), intro: 'Everyone here kept a memory of this bridge. Point at someone to step into theirs.' }), people },
  };
})();

const ALL = new Map([...SF_MEMORIES, GOLDEN_GATE_CROWD].map((m) => [m.id, m]));
export const sfMemory = (id: string): SfMemory | null => ALL.get(id) ?? null;
/** Photos kept back for the live demonstration (shared on the day, planned live). */
export const LIVE_DEMO_PHOTOS = ['IMG_3675.JPG', 'IMG_3680.JPG', 'IMG_3652.jpg'];
