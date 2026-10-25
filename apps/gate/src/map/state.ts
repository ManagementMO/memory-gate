// Where memories live: places on a flat world map. "Here" is fixed to San Francisco for now (no location prompt), and
// a place opens only when you're there. Whether each of your memories is public is kept on this device.
import { create } from 'zustand';
import type { AlbumMemory } from '../album/types';

export type PlaceId = 'sf' | 'ny';
export type Place = { id: PlaceId; name: string; lat: number; lng: number };
export const PLACES: Record<PlaceId, Place> = {
  sf: { id: 'sf', name: 'San Francisco, CA', lat: 37.7749, lng: -122.4194 },
  ny: { id: 'ny', name: 'New York, NY', lat: 40.7128, lng: -74.006 },
};
export const HERE: PlaceId = 'sf';
export const isOpen = (id: PlaceId) => id === HERE;

/** A pin on the map: how many memories a place holds, and whether it opens from here. */
export type Pin = { place: PlaceId; count: number; locked: boolean };
/** Which side of its pin a place's name sits on, toward open ocean (San Francisco's would cover New York's). */
export const LABEL_SIDE: Record<PlaceId, 'left' | 'right'> = { sf: 'left', ny: 'right' };

export type Tab = 'mine' | 'world';
type AtlasState = { tab: Tab; place: PlaceId | null; show: (place: PlaceId | null, tab?: Tab) => void };
/** What the album stage shows: the map (place null), or one place's memories under a tab. */
export const useAtlas = create<AtlasState>((set) => ({
  tab: 'mine',
  place: null,
  show: (place, tab) => set((s) => ({ place, tab: tab ?? s.tab })),
}));

export type Visibility = 'private' | 'public';
const VISIBILITY_KEY = 'mg.gate.visibility';

/** The same memory has a local id during the visit and `code:title` once it comes back from the backend; the key is
 *  the backend's form either way, so a choice made just after a visit survives the reload. */
export function visibilityKey(memory: AlbumMemory, sessionCode: string | null): string {
  if (memory.id.includes(':') || !sessionCode) return memory.id;
  const title = (memory.moments[0]?.memoryTitle ?? memory.title).slice(0, 60) || 'A remembered place';
  return `${sessionCode}:${title}`;
}

function loadPublic(): Record<string, true> {
  try {
    const v = JSON.parse(localStorage.getItem(VISIBILITY_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, true>) : {};
  } catch { return {}; }
}

type VisibilityState = { publicKeys: Record<string, true>; set: (key: string, v: Visibility) => void };
/** Private unless chosen otherwise: only the public keys are stored. */
export const useVisibility = create<VisibilityState>((set, get) => ({
  publicKeys: loadPublic(),
  set: (key, v) => {
    const publicKeys = { ...get().publicKeys };
    if (v === 'public') publicKeys[key] = true; else delete publicKeys[key];
    set({ publicKeys });
    try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(publicKeys)); } catch { /* private mode: kept for this visit only */ }
  },
}));
