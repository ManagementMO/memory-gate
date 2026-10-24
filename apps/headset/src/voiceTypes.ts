// The voice module contract (apps/headset/src/voice/index.ts is written by the voice owner; voiceStub.ts is the
// typed/mock fallback with the same shape). The app only ever talks to voice through these types.
import type { ConvexClient } from 'convex/browser';
import type { Api } from './net.js';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type VoiceResult = { transcript: string; durationMs: number; audioFileId: string | null };

export type Voice = {
  ready: Promise<void>;
  start(): Promise<void>;
  stop(): Promise<VoiceResult>;
  /** `language` (ISO 639-1) lets the voice speak a non-English reply in the storyteller's language. */
  speak(text: string, opts?: { language?: string | null }): Promise<void>;
  cancelSpeech(): void;
  /** 0..1: microphone loudness while listening, TTS loudness while speaking. */
  level(): number;
  mode: 'live' | 'mock';
};

export type VoiceOptions = {
  client: ConvexClient;
  api: Api;
  code: string;
  token: string;
  onState(state: VoiceState): void;
  onError(msg: string): void;
};

export type CreateVoice = (opts: VoiceOptions) => Voice;
