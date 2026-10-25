export type ObjectTopicKey = string;
export const OBJECT_CONTEXT_VERSION: number;
export const OBJECT_TOPIC_KEYS: readonly ObjectTopicKey[];
/** A short attributed passage (`kind` text, the default) or a public-domain archive photo (`kind` photo). */
export type ObjectReference = { topicKey: ObjectTopicKey; kind?: 'text' | 'photo' | string; sourceUrl: string; title: string; attribution: string; excerpt: string; fetchedAt: number; license?: string; imageUrl?: string; date?: string };
export type ObjectSource = { url: string; title: string; attribution: string; license?: string; wiki?: string };
export type ObjectTopic = { label: string; heading: string; context: string; sources: ObjectSource[]; photos: string | null };
export const OBJECT_TOPICS: Readonly<Record<ObjectTopicKey, ObjectTopic>>;
export function objectTopic(key: unknown): ObjectTopic;
export function topicForKind(kind: string): ObjectTopicKey | null;
export function wordsAllowed(source: { license?: string } | undefined): number;
export function wikiExcerpt(extract: string | null | undefined, source: ObjectSource): string | null;
export function normalizeObjectReferences(rows: unknown, topicKey: ObjectTopicKey): ObjectReference[];
export function extractObjectReference(html: string, topicKey: ObjectTopicKey, source: ObjectSource, now?: number): ObjectReference;
export function collectObjectKnowledge(input: { topicKey?: ObjectTopicKey; topicKeys?: ObjectTopicKey[] }, request?: typeof fetch, options?: { pause?: number }): Promise<{ references: ObjectReference[]; warnings: string[] }>;
