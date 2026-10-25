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
}): ScenePlan {
  const objects: PlanObject[] = p.things.map((t, i) => ({ id: `${t.kind}-${i}`, kind: t.kind, label: t.label, color: t.color, material: null, zone: t.zone, relation: t.relation, target: t.target, scale: 1, quote: null }));
  return {
    version: 1, title: p.title,
    setting: { indoor: !!p.indoor, type: p.type, timeOfDay: p.time, weather: p.weather ?? 'clear', floor: p.floor, palette: p.palette ?? [], walls: !!p.indoor, water: !!p.water },
    ambience: p.indoor ? 'dust' : 'leaves',
    objects,
    people: p.people.map((x, i) => ({ id: `person-${i}`, ...x })),
    ...(p.landmark ? { landmark: p.landmark } : {}),
    intro: p.intro,
  };
}

// skin and hair tones used below
const S = { fair: '#e6c3a8', light: '#e0b99a', tan: '#d9a988', olive: '#c99a7a', brown: '#a8724f', deep: '#8d5a3b', dark: '#6b4a35' };
const H = { black: '#1e1a18', darkBrown: '#2a1f1a', brown: '#5a3c28', auburn: '#6b3420', blonde: '#b08a5a', grey: '#b9bcc4' };
const W = '#f2efe8';

export const SF_MEMORIES: SfMemory[] = [
  {
    id: 'sf:palace-sisters', place: 'palace', lat: 37.8031, lng: -122.4487, owner: 'Mei Chen', when: 'August 2023', crowd: false,
    title: 'White dresses by the lagoon', photo: '/memories/sf/IMG_3650.jpg',
    words: ['My sister and I wore matching white dresses for her birthday.', 'The light came through the rotunda, and the lagoon was so still it held the whole dome.'],
    plan: plan({
      title: 'The Palace of Fine Arts', type: 'lagoon', time: 'golden', floor: 'stone', water: true, palette: ['#e8d9c4'],
      things: [thing('tree', 'weeping willow', 'back-left'), thing('bush', 'boxwood', 'left'), thing('flowers', 'white roses', 'front-left', '#f4f2ee'), thing('lamp_post', 'old street lamp', 'right')],
      people: [person('young adult', 'female', 'stand', { skin: S.light, hair: H.black, top: W, bottom: W }, 'center'), person('young adult', 'female', 'wait', { skin: S.light, hair: H.black, top: '#efe9dc', bottom: '#efe9dc' }, 'center')],
      landmark: { id: 'palace_of_fine_arts', bearing: 0, distance: 120, yaw: 0 },
      intro: 'The rotunda glows across the water, and the lagoon holds the dome.',
    }),
  },
  {
    id: 'sf:telegraph-hill', place: 'telegraph', lat: 37.8008, lng: -122.4049, owner: 'Sofia Alvarez', when: 'March 2024', crowd: false,
    title: 'Green and Montgomery', photo: '/memories/sf/IMG_3653.jpg',
    words: ['I lived at the top of the Filbert Steps that year.', 'Every morning I walked down Green Street, and the Pyramid was right there between the bay windows.'],
    plan: plan({
      title: 'Green Street', type: 'street', time: 'midday', floor: 'stone',
      things: [thing('house', 'victorian house', 'back-left'), thing('house', 'painted lady', 'back-right'), thing('car', 'white sedan', 'left', '#f4f2ee'), thing('lamp_post', 'street lamp', 'right'), thing('tree', 'street tree', 'front-right'), thing('fire_hydrant', 'fire hydrant', 'front-left')],
      people: [person('young adult', 'female', 'stand', { skin: S.tan, hair: '#3a2a20', top: '#efe6d6', bottom: '#f4f2ee' })],
      landmark: { id: 'transamerica', bearing: 0, distance: 900, yaw: 0 },
      intro: 'Green Street at midday: bay windows on both sides, and the Pyramid straight ahead.',
    }),
  },
  {
    id: 'sf:baker-scarf', place: 'baker', lat: 37.7939, lng: -122.4834, owner: 'Hana Kim', when: 'October 2023', crowd: true,
    title: 'Wind at Baker Beach', photo: '/memories/sf/IMG_3655.jpg',
    words: ['We drove out after work just to catch the light.', 'The wind kept stealing my scarf, and the bridge was the only thing in the haze.'],
    plan: plan({
      title: 'Baker Beach', type: 'beach', time: 'golden', weather: 'soft', floor: 'sand', water: true,
      things: [thing('rock', 'rocks', 'left'), thing('picnic_blanket', 'beach towel', 'front-right', '#d98a96'), thing('handbag', 'straw tote bag', 'front-right', '#d9c7a6'), thing('rock', 'rock', 'back-right')],
      people: [person('young adult', 'female', 'wait', { skin: S.light, hair: H.darkBrown, top: '#e8a0b4', bottom: W })],
      landmark: gate(-28, 2300, 18),
      intro: 'The wind off the water, the sand still warm, and the bridge in the haze.',
    }),
  },
  {
    id: 'sf:baker-red', place: 'baker', lat: 37.7925, lng: -122.4842, owner: 'Amara Okafor', when: 'June 2024', crowd: true,
    title: 'The red dress', photo: '/memories/sf/IMG_3670.JPG',
    words: ['I bought the red dress for a wedding and wore it to the beach instead.', 'The bridge went pink and then grey while we walked.'],
    plan: plan({
      title: 'Baker Beach at sunset', type: 'beach', time: 'dusk', floor: 'sand', water: true,
      things: [thing('rock', 'big rocks', 'right'), thing('rock', 'rocks', 'back-left')],
      people: [person('young adult', 'female', 'walk', { skin: S.deep, hair: H.black, top: '#b8322e', bottom: '#b8322e' }, 'back', 180)],
      landmark: gate(14, 2000, -14),
      intro: 'Sunset at Baker Beach: a red dress walking toward the bridge.',
    }),
  },
  {
    id: 'sf:alamo-postcard', place: 'alamo', lat: 37.7766, lng: -122.4344, owner: 'Priya Nair', when: 'January 2024', crowd: false,
    title: 'Postcard Row', photo: '/memories/sf/IMG_3661.jpg',
    words: ['The first Sunday after I moved here, I walked up to Alamo Square because it is on every postcard.', 'It is even better in person. The houses look like cake.'],
    plan: plan({
      title: 'Alamo Square', type: 'park', time: 'golden', floor: 'grass',
      things: [thing('pine_tree', 'monterey cypress', 'back-left'), thing('pine_tree', 'cypress', 'back-right'), thing('bench', 'park bench', 'left'), thing('lamp_post', 'street lamp', 'right'), thing('bush', 'hedge', 'front-left'), thing('flowers', 'flower border', 'front-right')],
      people: [person('young adult', 'female', 'stand', { skin: S.brown, hair: '#2a1d16', top: '#6b2734', bottom: '#2c3e66' })],
      landmark: { id: 'painted_ladies', bearing: 0, distance: 90, yaw: 0 },
      intro: 'Alamo Square in the sun, with the Painted Ladies lined up across the street.',
    }),
  },
  {
    id: 'sf:alamo-picnic', place: 'alamo', lat: 37.7761, lng: -122.4351, owner: 'Ellie Brooks', when: 'July 2022', crowd: false,
    title: 'Our spot on the hill', photo: '/memories/sf/IMG_3676.JPG',
    words: ['Tom and I had a picnic every Saturday that summer, always the same spot on the slope.', 'The city looked like it was sitting right behind the houses.'],
    plan: plan({
      title: 'The slope at Alamo Square', type: 'park', time: 'golden', floor: 'grass',
      things: [thing('picnic_blanket', 'picnic blanket', 'center', '#c0504d'), thing('basket', 'picnic basket', 'center'), thing('tree', 'old tree', 'back-left'), thing('bush', 'boxwood', 'back-right'), thing('bench', 'park bench', 'right')],
      people: [person('young adult', 'female', 'wait', { skin: S.tan, hair: H.brown, top: W, bottom: '#4a78b8' }, 'center', 180, [-0.35, -0.3]), person('young adult', 'male', 'stand', { skin: S.tan, hair: '#3a2a20', top: '#9a9aa2', bottom: '#2c3e66' }, 'center', 180, [0.35, -0.3])],
      landmark: { id: 'painted_ladies', bearing: 8, distance: 110, yaw: 0 },
      intro: 'The slope of the park, the picnic, and the houses with the whole city behind them.',
    }),
  },
  {
    id: 'sf:chinatown', place: 'chinatown', lat: 37.7943, lng: -122.4063, owner: 'Grace Liu', when: 'February 2024', crowd: false,
    title: 'Lanterns on Grant Avenue', photo: '/memories/sf/IMG_3674.JPG',
    words: ['My grandmother’s shop was two blocks down.', 'Whenever the lanterns went up for New Year she sent me out to count them, and I never got the same number twice.'],
    plan: plan({
      title: 'Grant Avenue', type: 'street', time: 'midday', floor: 'stone', palette: ['#c0504d'],
      things: [thing('shop', 'chinatown shop', 'back'), thing('car', 'parked car', 'left'), thing('car', 'taxi', 'right', '#e8c547'), thing('lamp_post', 'street lamp', 'front-left'), thing('lantern', 'red lantern', 'front-right', '#c0504d'), thing('trash_can', 'trash can', 'right')],
      people: [person('adult', 'female', 'walk', { skin: S.light, hair: H.black, top: W, bottom: '#2b2b30' }, 'back-left', 0), person('adult', 'male', 'walk', { skin: S.light, hair: H.black, top: '#2c3e66', bottom: '#2b2b30' }, 'back-right', 180)],
      intro: 'Grant Avenue under the red lanterns, the shops open and the street busy.',
    }),
  },
  {
    id: 'sf:north-beach', place: 'northbeach', lat: 37.7984, lng: -122.4072, owner: 'Jae Park', when: 'May 2023', crowd: false,
    title: 'Our corner', photo: '/memories/sf/IMG_3664.jpg',
    words: ['Marcus and I met at that corner every Friday for a year to get pizza by the slice.', 'We leaned on the signal pole and argued about which place was better.'],
    plan: plan({
      title: 'The corner', type: 'street', time: 'midday', floor: 'stone',
      things: [thing('building', 'brick building', 'back'), thing('lamp_post', 'street lamp', 'left'), thing('fire_hydrant', 'fire hydrant', 'right'), thing('car', 'parked car', 'right'), thing('trash_can', 'trash can', 'left')],
      people: [person('young adult', 'male', 'talk', { skin: S.light, hair: H.black, top: '#f4f2ee', bottom: '#8fa7c7' }), person('young adult', 'male', 'wait', { skin: S.olive, hair: H.darkBrown, top: '#f4f2ee', bottom: '#5a5a62' })],
      intro: 'The corner in the afternoon sun: the brick building and the signal pole.',
    }),
  },
  // ---- the Golden Gate ----
  {
    id: 'sf:gg-fog', place: 'golden_gate', lat: 37.8284, lng: -122.4822, owner: 'Nora Lindqvist', when: 'September 2023', crowd: true,
    title: 'Between the eucalyptus', photo: '/memories/sf/IMG_3659.jpg',
    words: ['The fog was so thick that morning we almost turned back.', 'Then it opened for a minute between the trees, just the north tower, and nobody said anything.'],
    plan: plan({
      title: 'The headlands in fog', type: 'hill', time: 'morning', weather: 'mist', floor: 'grass', water: true,
      things: [thing('tree', 'eucalyptus', 'left'), thing('tree', 'eucalyptus', 'right'), thing('bush', 'coastal shrub', 'front-left'), thing('rock', 'rock', 'front-right')],
      people: [person('adult', 'female', 'wait', { skin: S.fair, hair: H.darkBrown, top: '#3a3a40', bottom: '#2b2b30' }, 'center', 180)],
      landmark: gate(-4, 1100, 58, 110),
      intro: 'Morning fog between the eucalyptus, and the north tower opening through it.',
    }),
  },
  {
    id: 'sf:gg-trail', place: 'golden_gate', lat: 37.8282, lng: -122.4808, owner: 'Isabel Moreno', when: 'April 2024', crowd: true,
    title: 'The trail above the bridge', photo: '/memories/sf/IMG_3660.jpg',
    words: ['We hiked up from Kirby Cove with our hair full of wind.', 'When the whole bridge came into view, the city was lit up behind it like a postcard.'],
    plan: plan({
      title: 'Above the bridge', type: 'hill', time: 'golden', floor: 'grass', water: true,
      things: [thing('fence', 'wooden fence', 'right'), thing('bush', 'coastal shrub', 'left'), thing('flowers', 'yellow wildflowers', 'front-right', '#e8c547'), thing('rock', 'rock', 'front-left')],
      people: [person('young adult', 'female', 'wait', { skin: S.fair, hair: H.auburn, top: '#6b2734', bottom: '#3a5a8a' }, 'center', 180)],
      landmark: gate(12, 1100, 56, 100),
      intro: 'The trail above the bridge, wind in the grass and the city behind it.',
    }),
  },
  {
    id: 'sf:gg-hawk-hill', place: 'golden_gate', lat: 37.8257, lng: -122.4985, owner: 'Leo Tanaka', when: 'March 2022', crowd: true,
    title: 'Last light from Hawk Hill', photo: '/memories/sf/IMG_3662.jpg',
    words: ['I came up here alone the night I got into grad school.', 'The sun went down behind me and the bridge turned gold, and I called my mom from the top.'],
    plan: plan({
      title: 'Hawk Hill', type: 'hill', time: 'dusk', floor: 'grass', water: true,
      things: [thing('bush', 'coastal shrub', 'front-left'), thing('rock', 'rocks', 'right'), thing('flowers', 'wildflowers', 'left')],
      people: [person('young adult', 'male', 'stand', { skin: S.light, hair: H.black, top: '#f4f2ee', bottom: '#2b2b30' }, 'center', 180)],
      landmark: gate(-10, 2400, 38, 250),
      intro: 'Hawk Hill at sunset, the bridge going gold far below.',
    }),
  },
  {
    id: 'sf:gg-three-friends', place: 'golden_gate', lat: 37.8295, lng: -122.4838, owner: 'Daniel Okoye', when: 'May 2024', crowd: true,
    title: 'Three of us and the bay', photo: '/memories/sf/IMG_3668.JPG',
    words: ['Our last weekend before everyone moved away.', 'We stood at the edge in the wildflowers and promised to come back every year. We have kept it twice.'],
    plan: plan({
      title: 'The overlook', type: 'hill', time: 'midday', floor: 'grass', water: true,
      things: [thing('flowers', 'yellow wildflowers', 'front-left', '#e8c547'), thing('flowers', 'yellow flowers', 'front-right', '#e8c547'), thing('bush', 'coastal shrub', 'left'), thing('rock', 'rock', 'back-right')],
      people: [person('young adult', 'male', 'stand', { skin: S.dark, hair: H.black, top: '#f4f2ee', bottom: '#5a5a62' }, 'center', 180), person('young adult', 'female', 'wait', { skin: S.fair, hair: H.blonde, top: '#2b2b30', bottom: '#3a5a8a' }, 'center', 180), person('young adult', 'female', 'stand', { skin: S.olive, hair: '#3a2a20', top: '#9a9aa2', bottom: '#2b2b30' }, 'center', 180)],
      landmark: gate(14, 1300, 62, 110),
      intro: 'The overlook in full sun, yellow flowers at your feet and the whole bay open.',
    }),
  },
  {
    id: 'sf:gg-jump', place: 'golden_gate', lat: 37.8274, lng: -122.4796, owner: 'Ravi Shah', when: 'August 2024', crowd: true,
    title: 'Eleven tries', photo: '/memories/sf/IMG_3671.WEBP',
    words: ['I made everyone jump at the same time for the photo.', 'It took eleven tries, and in the one we kept, only Sam is actually in the air.'],
    plan: plan({
      title: 'The overlook trail', type: 'overlook', time: 'midday', floor: 'sand', water: true,
      things: [thing('fence', 'wooden fence', 'back-left'), thing('bush', 'coastal shrub', 'back-right'), thing('rock', 'rock', 'right')],
      people: [person('young adult', 'male', 'cheer', { skin: S.tan, hair: '#3a2a20', top: '#9a9aa2', bottom: '#c8a77c' }, 'center'), person('young adult', 'female', 'cheer', { skin: S.light, hair: H.darkBrown, top: '#4a78b8', bottom: '#2b2b30' }, 'center'), person('adult', 'male', 'photo', { skin: S.brown, hair: H.black, top: '#9a9aa2', bottom: '#2c3e66' }, 'front-right', 270)],
      landmark: gate(-30, 1200, 52, 90),
      intro: 'The overlook in the sun, everyone mid-jump with the bridge behind them.',
    }),
  },
  {
    id: 'sf:gg-crissy-family', place: 'golden_gate', lat: 37.8059, lng: -122.4648, owner: 'Lucia Garcia', when: 'November 2023', crowd: true,
    title: 'Running on Crissy Field', photo: '/memories/sf/IMG_3672.JPG',
    words: ['Every Sunday after church we let the kids run on the sand at Crissy Field.', 'Mateo raced the waves, and Ana held her dad’s hand and refused to get her shoes wet.'],
    plan: plan({
      title: 'Crissy Field', type: 'beach', time: 'golden', weather: 'soft', floor: 'sand', water: true,
      things: [thing('picnic_blanket', 'beach towel', 'front-right', '#4a78b8'), thing('ball', 'beach ball', 'front-left', '#e8c547'), thing('bucket', 'toy bucket', 'right', '#c0504d'), thing('rock', 'rocks', 'back-left')],
      people: [person('adult', 'male', 'walk', { skin: S.tan, hair: '#3a2a20', top: W, bottom: '#2b2b30' }, 'center'), person('adult', 'female', 'walk', { skin: S.olive, hair: H.black, top: '#2f4a3a', bottom: '#2f4a3a' }, 'center'), person('child', 'female', 'walk', { skin: S.olive, hair: H.black, top: '#2f5a3a', bottom: '#2f5a3a' }, 'center'), person('child', 'male', 'walk', { skin: S.olive, hair: H.black, top: '#2f8a8a', bottom: '#2c3e66' }, 'front-left')],
      landmark: gate(-38, 2500, 14),
      intro: 'Crissy Field in the late sun, the kids running and the bridge across the water.',
    }),
  },
  {
    id: 'sf:gg-hats', place: 'golden_gate', lat: 37.8289, lng: -122.4829, owner: 'Chloe Martin', when: 'June 2023', crowd: true,
    title: 'Hats and wildflowers', photo: '/memories/sf/IMG_3673.JPG',
    words: ['My cousins flew in from Lyon, and this was the one thing they wanted to see.', 'We wore our sun hats, stood in the flowers, and did not talk for a long time.'],
    plan: plan({
      title: 'Wildflowers above the bay', type: 'hill', time: 'midday', floor: 'grass', water: true,
      things: [thing('flowers', 'yellow wildflowers', 'front-left', '#e8c547'), thing('flowers', 'wildflowers', 'front-right', '#e8c547'), thing('bush', 'coastal shrub', 'back-left'), thing('rock', 'rock', 'back-right')],
      people: [person('young adult', 'female', 'stand', { skin: S.fair, hair: H.brown, top: '#8cc3e8', bottom: W }, 'center', 180), person('young adult', 'female', 'wait', { skin: S.fair, hair: H.blonde, top: W, bottom: '#3a5a8a' }, 'center', 180), person('young adult', 'female', 'stand', { skin: S.tan, hair: '#3a2a20', top: '#9a9aa2', bottom: '#2b2b30' }, 'center', 180)],
      landmark: gate(18, 1200, 60, 110),
      intro: 'Wildflowers along the edge, three sun hats, and the bridge below.',
    }),
  },
  {
    id: 'sf:gg-rocks', place: 'golden_gate', lat: 37.8003, lng: -122.4793, owner: 'Sam Rivera', when: 'September 2024', crowd: true,
    title: 'On the rocks at golden hour', photo: '/memories/sf/IMG_3677.JPG',
    words: ['I had been working nights for a year.', 'The first evening I had off, I climbed down to the rocks below the bridge and stood there with my arms open until the sun was gone.'],
    plan: plan({
      title: 'The rocks below the bridge', type: 'beach', time: 'golden', floor: 'sand', water: true,
      things: [thing('rock', 'big rocks', 'center'), thing('rock', 'rocks', 'left'), thing('rock', 'mossy rocks', 'right')],
      people: [person('adult', 'male', 'cheer', { skin: S.olive, hair: '#3a2a20', top: '#b8524a', bottom: '#5a5a62' }, 'back', 20)],
      landmark: gate(30, 1200, -30),
      intro: 'The rocks below the bridge, the sun low and gold on the water.',
    }),
  },
  {
    id: 'sf:gg-graduation', place: 'golden_gate', lat: 37.8083, lng: -122.4738, owner: 'Aisha Rahman', when: 'May 2024', crowd: true,
    title: 'Graduation day', photo: '/memories/sf/IMG_3678.JPG',
    words: ['We graduated in the morning and drove straight to the water in our jean jackets.', 'Someone said one, two, three, arms up, and for once we all did it at the same time.'],
    plan: plan({
      title: 'The water’s edge', type: 'shore', time: 'golden', floor: 'grass', water: true,
      things: [thing('rock', 'rocks', 'back-left'), thing('bench', 'bench', 'right'), thing('lamp_post', 'street lamp', 'left')],
      people: [person('young adult', 'female', 'wave', { skin: S.deep, hair: H.black, top: '#4a6a9a', bottom: '#2b2b30' }), person('young adult', 'female', 'wave', { skin: S.fair, hair: H.darkBrown, top: '#2b2b30', bottom: '#3a5a8a' }), person('young adult', 'female', 'wave', { skin: S.tan, hair: '#3a2a20', top: '#a8323a', bottom: '#3a5a8a' }), person('young adult', 'female', 'wave', { skin: S.olive, hair: H.black, top: W, bottom: '#3a5a8a' })],
      landmark: gate(0, 1300, 0),
      intro: 'The water’s edge at Crissy Field: jean jackets, and the bridge across the bay.',
    }),
  },
  {
    id: 'sf:gg-sundays', place: 'golden_gate', lat: 37.8046, lng: -122.4743, owner: 'Walt Henderson', when: 'October 2022', crowd: true,
    title: 'Sundays at the overlook', photo: '/memories/sf/IMG_3679.JPG',
    words: ['After I retired I walked to the overlook every Sunday morning. The same people, the same benches.', 'We never learned each other’s names, but we always nodded.'],
    plan: plan({
      title: 'The overlook', type: 'overlook', time: 'morning', floor: 'stone', water: true,
      things: [thing('bench', 'park bench', 'left'), thing('bench', 'bench', 'right'), thing('fence', 'iron railing', 'back'), thing('bush', 'hedge', 'back-left'), thing('lamp_post', 'street lamp', 'front-right')],
      people: [person('older', 'male', 'wait', { skin: S.fair, hair: H.grey, top: '#2c3e66', bottom: '#c8a77c' }, 'center', 180), person('adult', 'female', 'stand', { skin: S.tan, hair: H.brown, top: '#9caf88', bottom: '#2b2b30' }, 'back-left', 180), person('adult', 'male', 'stand', { skin: S.tan, hair: '#3a2a20', top: '#4a4a52', bottom: '#2c3e66' }, 'back-left', 180)],
      landmark: gate(-14, 1000, -12, 40),
      intro: 'A quiet Sunday morning at the overlook, the bridge close and bright.',
    }),
  },
];

/** The Golden Gate as a place of its own: you, as yourself, among everyone who kept a memory there, each holding
 *  their picture. Pointing at someone steps into their memory. */
export const GOLDEN_GATE_CROWD: SfMemory = (() => {
  const here = SF_MEMORIES.filter((m) => m.crowd);
  // An open arc in front of you, each person a few metres off and turned toward the middle of it.
  const people = here.map((m, i): PlanPerson => {
    const first = m.plan.people?.[0];
    const a = -1.0 + (2.0 * i) / Math.max(1, here.length - 1);
    const r = 2.7 + (i % 2) * 0.6;
    return {
      age: first?.age ?? 'adult', gender: first?.gender ?? 'female', skin: first?.skin ?? null, hair: first?.hair ?? null, top: first?.top ?? null, bottom: first?.bottom ?? null,
      id: `crowd-${i}`, pose: (['wave', 'stand', 'wait'] as const)[i % 3]!, zone: 'center', facing: ((-a * 180) / Math.PI) * 0.5,
      at: [Math.sin(a) * r, 0.4 - Math.cos(a) * r * 0.5], memory: m.id,
    };
  });
  const p = plan({
    title: 'The Golden Gate Bridge', type: 'overlook', time: 'golden', floor: 'grass', water: true,
    things: [thing('bench', 'park bench', 'front-left'), thing('lamp_post', 'street lamp', 'front-right'), thing('bush', 'coastal shrub', 'back-left'), thing('flowers', 'yellow wildflowers', 'back-right', '#e8c547')],
    people: [], landmark: gate(0, 1000, 0),
    intro: 'Everyone here kept a memory of this bridge. Point at someone to step into theirs.',
  });
  return {
    id: 'sf:golden-gate', place: 'golden_gate', lat: 37.8199, lng: -122.4783, owner: 'Everyone who was here', when: '', crowd: false,
    title: 'The Golden Gate Bridge', photo: '/memories/sf/IMG_3679.JPG',
    words: [`${here.length} people kept a memory here. Walk among them, and point at anyone to step into theirs.`],
    plan: { ...p, people },
  };
})();

const ALL = new Map([...SF_MEMORIES, GOLDEN_GATE_CROWD].map((m) => [m.id, m]));
export const sfMemory = (id: string): SfMemory | null => ALL.get(id) ?? null;
/** Photos kept back for the live demonstration (shared on the day, planned live). */
export const LIVE_DEMO_PHOTOS = ['IMG_3675.JPG', 'IMG_3680.JPG', 'IMG_3652.jpg'];
