// Feature flags (CLAUDE.md "Flags"). Every flag is false in tests and CI; the demo deployment turns them on from the
// phone's admin screen. Each live service has a fixture fallback, so all-false still runs the whole story.
export const FLAG_NAMES = ['splat.live', 'objects.live', 'ai.live', 'stt.live', 'tts.live', 'worldlabs.backdrop', 'worldlabs.generate', 'splat.lite'] as const;
export type FlagName = (typeof FLAG_NAMES)[number];
export type Flags = Record<FlagName, boolean>;
export const DEFAULT_FLAGS: Flags = Object.fromEntries(FLAG_NAMES.map((n) => [n, false])) as Flags;
