// World memories: albums people chose to share publicly. Until sharing reaches other devices, San Francisco holds a
// few clearly labelled fictional people (made from the album's painted samples) and your own memories you made public.
// New York holds memories you can't open from here: only how many there are and a clouded picture, never their words.
import { sampleMemories } from '../album/samples';
import type { AlbumMemory } from '../album/types';

export type SharedAlbum = { id: string; owner: string; sample: boolean; memories: AlbumMemory[] };
export type Clouded = { id: string; imageUrl: string | null };

/** Fictional people sharing in San Francisco, each from one of the painted sample memories. */
const SF_PEOPLE = [
  { owner: 'Tom & Ana', from: 'sample-lake', title: 'Stow Lake at dusk' },
  { owner: 'Lupe', from: 'sample-kitchen', title: 'Grandma’s kitchen in the Mission' },
  { owner: 'June', from: 'sample-garden', title: 'The garden in June, Noe Valley' },
] as const;
export const SF_SAMPLE_COUNT = SF_PEOPLE.length;
export const NY_CLOUDED_COUNT = 4;

let painted: AlbumMemory[] | null = null;
/** The painted samples, drawn once (each picture is a canvas). */
export const paintedSamples = () => (painted ??= sampleMemories());

export function sampleAlbums(samples: AlbumMemory[]): SharedAlbum[] {
  return SF_PEOPLE.flatMap(({ owner, from, title }) => {
    const m = samples.find((s) => s.id === from);
    if (!m) return [];
    const id = `world:${from}`;
    const memory: AlbumMemory = { ...m, id, title, sample: true, moments: m.moments.map((x) => ({ ...x, id: `world:${x.id}`, memoryId: id, memoryTitle: title })) };
    return [{ id, owner, sample: true, memories: [memory] }];
  });
}

/** Your memories marked public, as one album under "You". */
export function publicMine(memories: AlbumMemory[], isPublic: (m: AlbumMemory) => boolean): SharedAlbum | null {
  const shared = memories.filter(isPublic);
  return shared.length ? { id: 'world:you', owner: 'You', sample: false, memories: shared } : null;
}

/** New York's memories, clouded: a picture to blur and nothing else. */
export function clouded(samples: AlbumMemory[], count = NY_CLOUDED_COUNT): Clouded[] {
  const pictures = samples.flatMap((m) => m.moments.map((x) => x.imageUrl)).filter(Boolean);
  return Array.from({ length: count }, (_, i) => ({ id: `ny-${i}`, imageUrl: pictures.length ? pictures[(i * 3 + 1) % pictures.length]! : null }));
}
