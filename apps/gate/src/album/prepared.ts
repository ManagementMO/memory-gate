// Prepared memories: the team's demonstration scenes, kept in the album beside the person's own visits and opened
// from it like any memory. They are fictional samples and say so wherever they're shown. Their pictures are taken from
// the real scenes (apps/gate/scripts/album-pictures.mjs), so polishing a scene and re-running it updates the album.
import { bringIn, placePlan, PLACES } from '../../../../packages/shared/src/places';
import type { AlbumMemory, AlbumMoment } from './types';

const AT = Date.parse('2026-10-24T21:35:00Z');
type Beat = { caption: string; who?: string; speaker?: 'you' | 'companion'; image: string; kind: 'arrival' | 'detail' | 'final' };
const moment = (id: string, memoryId: string, memoryTitle: string, m: Beat, i: number): AlbumMoment => ({
  id: `${memoryId}:${id}`, memoryId, memoryTitle, caption: m.caption, speaker: m.speaker ?? 'you', ...(m.who ? { who: m.who } : {}), at: AT + i,
  imageUrl: m.image, sourceUrl: null, audioUrl: null, kind: m.kind,
});

/** The courtyard's sample visit, told the way anyone would: the place is brought in from these words alone. */
const COURTYARD_WORDS = [
  'She had a table under the vines with two chairs, and always a teapot.',
  'There was a bowl of lemons and her old radio on the table.',
  'And a bench by the wall, with pots of plants.',
];
const courtyardPlan = COURTYARD_WORDS.reduce((plan, words) => bringIn(PLACES.courtyard, plan, words) ?? plan, placePlan(PLACES.courtyard, 'The courtyard'));

const RED_KITE = 'prepared:red-kite';
const COURTYARD = 'prepared:courtyard';
export const PREPARED: AlbumMemory[] = [
  {
    id: RED_KITE, title: 'The Red Kite', at: AT, source: 'words', palette: ['#c4512f'], sample: true,
    about: 'One afternoon in a California meadow, told by two friends. A fictional sample.',
    open: { href: '/?story=red-kite' },
    moments: [
      { caption: 'Rosa and I used to run down that little path. There was an old oak at the bend.', who: 'Elena, along the path', image: '/memories/red-kite/1-path.jpg', kind: 'arrival' as const },
      { caption: 'It was red. Rosa tied a cream ribbon to the tail.', who: 'Elena', image: '/memories/red-kite/2-red-kite.jpg', kind: 'detail' as const },
      { caption: 'The kite looked orange to me in that light. I remember the cream ribbon twisting.', who: 'Rosa, beside the oak', image: '/memories/red-kite/3-rosa-oak.jpg', kind: 'final' as const },
    ].map((m, i) => moment(String(i + 1), RED_KITE, 'The Red Kite', m, i)),
  },
  {
    id: COURTYARD, title: 'The courtyard', at: AT, source: 'words', palette: ['#5d7d4f'], sample: true,
    about: 'Afternoons under the grapevines, filled in from what was said. A fictional sample.',
    open: { scene: 'courtyard' }, place: 'courtyard', plan: courtyardPlan,
    moments: ([
      { caption: PLACES.courtyard.intro, speaker: 'companion', image: '/memories/courtyard/1-courtyard.jpg', kind: 'arrival' },
      { caption: COURTYARD_WORDS[1]!, image: '/memories/courtyard/2-table.jpg', kind: 'detail' },
      { caption: 'And a bench by the wall, where we’d sit and talk while the birds sang.', image: '/memories/courtyard/3-bench.jpg', kind: 'final' },
    ] as Beat[]).map((m, i) => moment(String(i + 1), COURTYARD, 'The courtyard', m, i)),
  },
];

/** Coming back from a prepared memory's own page lands in the album again (set when it's opened from there): your
 *  album, or World memories when it was opened from someone else's (the proposal showcase). */
const RETURN_KEY = 'mg.return-to';
export function openPrepared(m: AlbumMemory, visitScene?: (scene: string) => void, from: 'album' | 'world' = 'album'): void {
  if (!m.open) return;
  if ('href' in m.open) {
    try { sessionStorage.setItem(RETURN_KEY, from); } catch { /* the way back is a convenience */ }
    location.assign(m.open.href);
  } else visitScene?.(m.open.scene);
}
/** Once, when this page was reached by coming back from a prepared memory opened in the album: which tab it came
 *  from (your album or World memories), else null. */
export function cameBackToAlbum(): 'mine' | 'world' | null {
  try {
    const from = sessionStorage.getItem(RETURN_KEY);
    if (new URLSearchParams(location.search).has('story') || (from !== 'album' && from !== 'world')) return null;
    sessionStorage.removeItem(RETURN_KEY);
    return from === 'world' ? 'world' : 'mine';
  } catch { return null; }
}
