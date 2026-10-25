import { create } from 'zustand';
import type { ObjectTopicKey } from '../../../../actors/historical-memory-atlas/src/knowledge.mjs';
export type InfoTarget = { id: string; label: string; topic: ObjectTopicKey; node: string; lift: number; anchor?: [number, number, number] };
export const infoButtons = new Map<string, HTMLButtonElement>();
export const useObjectInfo = create<{ targets: InfoTarget[]; selected: string | null; busy: boolean; error: string; more: boolean }>(() => ({ targets: [], selected: null, busy: false, error: '', more: false }));
export const closeObjectInfo = () => useObjectInfo.setState({ selected: null, busy: false, error: '', more: false });
