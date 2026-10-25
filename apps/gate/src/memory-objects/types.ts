import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { SourceLibrary } from '../red-kite/memory-lens';
import { fileUrl } from '../backend/client';
export type RoomAuth = { code: string; token: string };
export type ObjectLibrary = FunctionReturnType<typeof api.memoryObjects.list>;
export type MemoryCandidate = ObjectLibrary['objects'][number];
export type PerspectiveOption = { key: string; label: string };
export type ModelId = Id<'memoryObjects'>;
export const sourceMediaUrl = (u: string | null | undefined) => u?.startsWith('/') ? u : fileUrl(u);
export type XRSource = {
  _id: string; objectKey: string; caption: string; note: string; owner: string; title?: string;
  imageUrl: string | null; execution: string; sourceUrl: string | null; sourceKind?: 'place' | 'social';
};
export function modelSource(object: MemoryCandidate, objects: ObjectLibrary, sources: SourceLibrary | undefined): XRSource {
  const place = objects.places.find(p => p._id === object.placeId), photo = sources?.sources.find(s => s._id === object.sourceId);
  return { _id: object._id, title: object.label, objectKey: object.assetKey === 'flower' ? 'flower' : object.assetKey === 'kite' ? 'kite' : 'landmark',
    caption: place ? `${place.title}. ${place.address}` : photo?.caption ?? 'A reviewed source illustration.',
    note: object.note || photo?.note || '', owner: place?.title ?? photo?.owner ?? 'Family source',
    imageUrl: sourceMediaUrl(photo?.imageUrl), execution: place?.execution ?? photo?.execution ?? 'fixture',
    sourceUrl: place?.sourceUrl ?? photo?.sourceUrl ?? null, sourceKind: place ? 'place' : 'social' };
}
