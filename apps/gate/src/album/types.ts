import type { ScenePlan } from '../../../../packages/shared/src/scene';

// What the moments album shows. A memory is one visit through the gate; a moment is a beat inside it (arriving,
// something added, leaving), captured as a picture of the place with the words that shaped it.
export type AlbumMoment = {
  id: string;
  memoryId: string;
  memoryTitle: string;
  /** The words of the moment: what the person said, or the companion's line on arrival. */
  caption: string;
  speaker: 'you' | 'companion';
  at: number;
  /** A picture of the 3D place at that moment (object URL or backend URL). */
  imageUrl: string | null;
  /** The original photo or video still, when the memory began from one. */
  sourceUrl: string | null;
  /** The person's own voice saying it, when kept. */
  audioUrl: string | null;
  kind: 'arrival' | 'detail' | 'final';
  /** Whose words these are, in a memory told by more than one person ("Elena, along the path"). */
  who?: string;
};

export type AlbumMemory = {
  id: string;
  title: string;
  at: number;
  source: 'photo' | 'video' | 'words';
  /** Up to three remembered colours, used to tint the memory's glass. */
  palette: string[];
  moments: AlbumMoment[];
  /** Fictional preview content, labelled as such wherever it's shown. */
  sample?: boolean;
  /** The plan the place was drawn from, so "Visit again" can bring it back exactly. */
  plan?: ScenePlan;
  /** The prepared place from the library it was visited in, if any (its world comes back with it). */
  place?: import('../../../../packages/shared/src/places').PlaceKey;
  /** A prepared memory (one of the team's demonstration scenes) opens its own place: a page of its own, or a
   *  prepared scene inside a visit. */
  open?: { href: string } | { scene: string };
  /** The line under its title, instead of when and how it was made. */
  about?: string;
};
