export type ObjectTopicKey = 'kite' | 'flowers' | 'trees';
export const OBJECT_CONTEXT_VERSION: number;
export type ObjectReference = { topicKey: ObjectTopicKey; sourceUrl: string; title: string; attribution: string; excerpt: string; fetchedAt: number };
export const OBJECT_TOPICS: Record<ObjectTopicKey, { label: string; heading: string; context: string; sources: { url: string; title: string; attribution: string }[] }>;
export function objectTopic(key: unknown): typeof OBJECT_TOPICS[ObjectTopicKey];
export function topicForKind(kind: string): ObjectTopicKey | null;
export function normalizeObjectReferences(rows: unknown, topicKey: ObjectTopicKey): ObjectReference[];
export function extractObjectReference(html: string, topicKey: ObjectTopicKey, source: { url: string; title: string; attribution: string }, now?: number): ObjectReference;
export function collectObjectKnowledge(input: { topicKey: ObjectTopicKey }, request?: typeof fetch): Promise<{ references: ObjectReference[] }>;
