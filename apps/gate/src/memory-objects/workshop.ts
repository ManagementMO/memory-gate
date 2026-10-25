import { create } from 'zustand';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { ModelId } from './types';
type State = { open: boolean; photos: boolean; selected: ModelId | null; preview: ModelId | null; previewPerspective: string | null; source: Id<'memorySources'> | null; set: (value: Partial<State>) => void };
export const useObjectWorkshop = create<State>(set => ({ open: false, photos: false, selected: null, preview: null, previewPerspective: null, source: null, set }));
export function openObjectWorkshop() { useObjectWorkshop.getState().set({ open: true, photos: false }); }
