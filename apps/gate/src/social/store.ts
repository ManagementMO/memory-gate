// Perspectives: every visit can be seen through two pairs of eyes, the grandparent's and the grandchild's. This store
// holds what this device knows of them: the perspectives (and who claimed each), whose eyes it is seeing through now,
// and everything each perspective keeps (stories, things it added to the place, the companion's thread with it,
// archive photographs, the likeness each person wears). It is filled from the team's exchange (SpacetimeDB, through
// the gateway, see link.ts); without the exchange the two perspectives still exist on this device, so the headset can
// always change height, but nothing is kept. Live heads and hands are kept outside React (see `poses`).
import { create } from 'zustand';
import type { PlanObject, Placement } from '../../../../packages/shared/src/scene';

export type PerspectiveKey = 'grandparent' | 'child';
export type Perspective = {
  id: string;
  key: PerspectiveKey;
  label: string;
  eyeHeight: number;
  color: string;
  claimedBy: string;
  claimedName: string;
  archivePlace: string;
  yearFrom: number;
  yearTo: number;
};
export type Story = {
  id: string; perspectiveId: string; memoryId: string; kind: 'story' | 'note'; text: string; objectId: string; at: number[];
  speakerId: string; speakerName: string; audioFileId: string; handedFrom: string; createdAt: number;
};
export type PerspectiveObject = {
  id: string; perspectiveId: string; memoryId: string; storyId: string; data: PlanObject; placement: Placement; addedBy: string; addedByName: string; createdAt: number;
};
export type Turn = { id: string; perspectiveId: string; who: 'person' | 'companion'; speakerName: string; text: string; createdAt: number };
export type Summary = { perspectiveId: string; summary: string; turnCount: number; updatedAt: number };
export type Handoff = {
  id: string; storyId: string; fromPerspectiveId: string; toPerspectiveId: string; senderId: string; senderName: string;
  status: 'pending' | 'accepted' | 'declined'; respondedBy: string; revision: number; createdAt: number; updatedAt: number;
};
export type ArchiveReference = {
  id: string; title: string; sourceUrl: string; publisher: string; date: string; description: string; rights: string;
  imageUrl: string | null; dateMatch: 'overlaps-requested-period' | 'unknown'; uncertainty: string; provenance: 'public-archive';
};
export type Pin = { id: string; perspectiveId: string; data: ArchiveReference; placement: Placement; addedBy: string; addedByName: string; createdAt: number };
export type Avatar = { memberId: string; url: string; bytes: number };
export type Pose = { memberId: string; perspectiveId: string; device: 'headset' | 'phone' | 'desktop'; inScene: boolean; head: number[]; left: number[]; right: number[]; updatedAt: number };
export type Member = { id: string; name: string; role: string };
/** Where a perspective stands in one memory, relative to its centre (metres). */
export type Spot = { perspectiveId: string; memoryId: string; x: number; z: number; objectId: string; source: 'default' | 'story' | 'world'; quote: string; updatedAt: number };

/** Eye heights are the two people's own (avatar/people.ts): the grandmother's 1.45 m, the boy's 1.21 m. */
export const PERSONAS: Record<PerspectiveKey, { label: string; eyeHeight: number; color: string }> = {
  grandparent: { label: 'Grandparent', eyeHeight: 1.45, color: '#8fb8ff' },
  child: { label: 'Grandchild', eyeHeight: 1.21, color: '#ffb48f' },
};
const local = (key: PerspectiveKey): Perspective => ({ id: `local:${key}`, key, ...PERSONAS[key], claimedBy: '', claimedName: '', archivePlace: '', yearFrom: 1900, yearTo: 1980 });

/** A line of the one conversation the companion holds with everyone in the visit (services/exchange/conversation.mjs). */
export type ConversationTurn = { id: string; who: 'person' | 'companion'; memberId: string; speakerName: string; perspectiveId: string; text: string; intent: string; createdAt: number };
export type SocialSnapshot = {
  perspectives: Perspective[]; stories: Story[]; objects: PerspectiveObject[]; turns: Turn[]; summaries: Summary[];
  handoffs: Handoff[]; pins: Pin[]; avatars: Avatar[]; spots: Spot[];
  conversation?: ConversationTurn[]; conversationSummary?: string | null;
};

type SocialState = SocialSnapshot & {
  /** 'live': the exchange is keeping perspectives for this visit; 'local': only this device knows them. */
  status: 'local' | 'live';
  memberId: string | null;
  members: Member[];
  /** Whose eyes this device sees through now. */
  viewing: PerspectiveKey;
  /** Flat screens: through those eyes (first person) or the overview of the whole place. */
  view: 'first' | 'overview';
  /** Show what the other perspective remembers (faint ghosts you can open). */
  ghosts: boolean;
  /** Has this person chosen whose eyes they see through yet (the picker asks once per visit). */
  chosen: boolean;
  /** The story card that is open (a ghost or a mark someone selected). */
  openStory: string | null;
  /** A short, kind line for the corner ("Handed to Grandparent"). */
  notice: { text: string; at: number } | null;
  /** The headset's measured eye height and the world scale that puts it at the perspective's eye line. */
  xr: { measured: number | null; k: number };
  /** The prepared world this visit's memory is shown in (a World Labs world id), if any. */
  worldId: string | null;
  set: (p: Partial<SocialState>) => void;
};

export const useSocial = create<SocialState>((set) => ({
  perspectives: [local('grandparent'), local('child')],
  stories: [], objects: [], turns: [], summaries: [], handoffs: [], pins: [], avatars: [], spots: [], conversation: [], conversationSummary: null,
  status: 'local',
  memberId: null,
  members: [],
  viewing: 'grandparent',
  view: 'overview',
  ghosts: true,
  chosen: false,
  openStory: null,
  notice: null,
  xr: { measured: null, k: 1 },
  worldId: null,
  set: (p) => set(p),
}));

/** Live heads and hands of the others, read every frame by the avatars (never through React). */
export const poses = new Map<string, Pose & { receivedAt: number }>();
/** Server time minus this device's clock, from the latest pose push. */
export const poseClock = { offset: 0 };

export const perspectiveOf = (key: PerspectiveKey): Perspective => useSocial.getState().perspectives.find((p) => p.key === key) ?? local(key);
export const perspectiveById = (id: string): Perspective | undefined => useSocial.getState().perspectives.find((p) => p.id === id);
export const viewingPerspective = (): Perspective => perspectiveOf(useSocial.getState().viewing);
export const notify = (text: string) => useSocial.getState().set({ notice: { text, at: Date.now() } });

export function applySnapshot(s: SocialSnapshot): void {
  const perspectives = s.perspectives.length ? s.perspectives.map((p) => ({ ...p, key: (p.key === 'child' ? 'child' : 'grandparent') as PerspectiveKey })) : useSocial.getState().perspectives;
  useSocial.setState({ ...s, spots: s.spots ?? [], conversation: s.conversation ?? [], conversationSummary: s.conversationSummary ?? null, perspectives, status: 'live' });
}

// For automated checks (like window.__gate and window.__presence).
if (typeof window !== 'undefined') (window as unknown as { __social?: unknown }).__social = { store: useSocial, poses };
