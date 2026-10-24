// Mock/typed voice with the real module's signature. Push-to-talk returns whatever is in the page's
// "Say it by typing…" box (so the emulator and desktop can drive the whole loop without a microphone), and speech is
// silent: a syllable-rate envelope stands in for TTS loudness while the caption is on screen.
import type { CreateVoice, VoiceResult, VoiceState } from './voiceTypes.js';

/** Where the stub reads its "transcript" from; the app wires this to the typed box. */
let typedSource: () => string = () => '';
export function setStubTranscriptSource(fn: () => string): void { typedSource = fn; }

export const createStubVoice: CreateVoice = ({ onState }) => {
  let state: VoiceState = 'idle';
  let t0 = 0;
  let speakEnd = 0;
  let speakTimer: ReturnType<typeof setTimeout> | null = null;
  let speakResolve: (() => void) | null = null;
  const set = (s: VoiceState) => { if (s !== state) { state = s; onState(s); } };

  const finishSpeech = () => {
    if (speakTimer) clearTimeout(speakTimer);
    speakTimer = null;
    speakEnd = 0;
    if (state === 'speaking') set('idle');
    const r = speakResolve; speakResolve = null; r?.();
  };

  return {
    mode: 'mock',
    ready: Promise.resolve(),
    async start() { t0 = performance.now(); set('listening'); },
    async stop(): Promise<VoiceResult> {
      const durationMs = t0 ? Math.round(performance.now() - t0) : 0;
      t0 = 0;
      set('idle');
      return { transcript: typedSource().trim(), durationMs, audioFileId: null };
    },
    speak(text: string) {
      finishSpeech();
      set('speaking');
      const ms = 900 + text.length * 55; // about the pace of the calm TTS voice
      speakEnd = performance.now() + ms;
      return new Promise<void>((resolve) => { speakResolve = resolve; speakTimer = setTimeout(finishSpeech, ms); });
    },
    cancelSpeech() { finishSpeech(); },
    level() {
      const now = performance.now();
      if (state === 'speaking' && now < speakEnd) {
        const t = now / 1000;
        return Math.max(0, 0.45 + 0.3 * Math.sin(t * 9.3) + 0.2 * Math.sin(t * 14.1 + 1.3)) * (0.6 + 0.4 * Math.sin(t * 2.1));
      }
      if (state === 'listening') return 0.25;
      return 0;
    },
  };
};
