/** Source cards supplement an illustration; they never change either person's telling. */
export type MemoryObject = 'kite' | 'flower' | 'landmark';
export const MEMORY_OBJECTS: Record<MemoryObject, { label: string; invitation: string }> = {
  kite: { label: 'The kite', invitation: 'What does this kite bring to mind?' },
  flower: { label: 'A flower', invitation: 'Did flowers like these grow somewhere familiar?' },
  landmark: { label: 'A familiar place', invitation: 'What do you remember about this place?' },
};
import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../../../convex/_generated/api';
export type SourceLibrary = FunctionReturnType<typeof api.memorySources.list>;
export type MemorySource = SourceLibrary['sources'][number];
