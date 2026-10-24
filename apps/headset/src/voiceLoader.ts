// Picks the real voice module (src/voice/index.ts, owned by the voice agent) when it exists, else the stub.
// import.meta.glob resolves at dev/build time and yields {} when the file is missing, so the app builds and
// typechecks either way; in dev, Vite reloads this module when the file appears. `?voice=mock` forces the stub.
// The module is imported early but only *created* inside a user gesture (Enable microphone, Enter, or the first
// push-to-talk), because creating it opens the microphone and an AudioContext.
import { createStubVoice } from './voiceStub.js';
import type { CreateVoice } from './voiceTypes.js';

const modules = import.meta.glob('./voice/index.ts');

export type VoiceFactory = { create: CreateVoice; source: 'module' | 'stub'; note: string | null };

export async function resolveVoiceFactory(): Promise<VoiceFactory> {
  const forceMock = new URLSearchParams(location.search).get('voice') === 'mock';
  const load = modules['./voice/index.ts'];
  if (!load) return { create: createStubVoice, source: 'stub', note: null };
  if (forceMock) return { create: createStubVoice, source: 'stub', note: 'mock voice forced by ?voice=mock' };
  try {
    const mod = (await load()) as { createVoice?: CreateVoice; default?: { createVoice?: CreateVoice } };
    const create = mod.createVoice ?? mod.default?.createVoice;
    if (typeof create === 'function') return { create, source: 'module', note: null };
    return { create: createStubVoice, source: 'stub', note: 'voice module has no createVoice export' };
  } catch (e) {
    return { create: createStubVoice, source: 'stub', note: `voice module failed to load: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}
