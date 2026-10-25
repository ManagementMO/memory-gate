// One store for the whole journey: portal → greeting → gathering → entering → forming → memory → leaving → album.
// React reads coarse state (stage, lines, offers); the 3D layer reads fast-changing values (level, enter progress)
// with useGate.getState() inside useFrame, so a 60 fps value never re-renders React.
import { create } from 'zustand';
import { BCP47, deviceLang, LANGUAGE_SETTINGS, type Lang, type LanguageSetting } from '../../../../packages/shared/src/language';

export type Stage = 'portal' | 'greeting' | 'gathering' | 'entering' | 'forming' | 'memory' | 'leaving' | 'album';
export type CompanionKind = 'light' | 'figure';
/** Where a visit begins: the aurora gate at night, or the Palace of Fine Arts at golden hour. */
export type WorldKind = 'aurora' | 'palace';
/** What the companion is doing. Both companions express all four. */
export type Mood = 'idle' | 'listening' | 'thinking' | 'speaking';
/** Finer emotional colour. The figure shows it in its eyes; the light shows it in its halo's warmth. */
export type Expression = 'neutral' | 'happy' | 'curious' | 'gentle' | 'sleepy';

export type Line = { id: number; text: string; interim: boolean; at: number };
export type MediaItem = { id: string; kind: 'photo' | 'video'; url: string; name: string; width: number; height: number; poster?: string; file?: Blob };
export type Session = { code: string; token: string; joinKey: string | null; role: 'host' | 'guest'; name: string };
/** 'shared': a device that joined a visit in the same room stays quiet; the main device listens and speaks. */
export type VoiceMode = 'off' | 'starting' | 'cartesia' | 'browser' | 'blocked' | 'unsupported' | 'shared';

export interface GateState {
  stage: Stage;
  companion: CompanionKind;
  world: WorldKind;
  mood: Mood;
  expression: Expression;
  /** 0..1: the microphone while listening, the voice envelope while speaking. */
  level: number;
  companionLine: Line | null;
  heardLine: Line | null;
  media: MediaItem | null;
  /** Which gentle offers are showing during gathering. */
  offers: { photo: boolean; video: boolean; invite: boolean };
  inviteOpen: boolean;
  voice: VoiceMode;
  musicOn: boolean;
  xr: boolean;
  /** 0..1, driven by the scene during the walk through the gate. */
  enterProgress: number;
  memoryId: string | null;
  /** The memory's name once known ("The lake house at dusk"); shown on the far side of the gate. */
  memoryTitle: string | null;
  session: Session | null;
  /** Set when this device arrived through an invitation link (a guest joining someone's memory). */
  invite: { code: string; key: string; host: string } | null;
  /** A short quiet status for the corner ("Listening", "Offline practice"). Never an error wall. */
  status: string;
  /** Freezes the conversation: no listening, no speech, the place stays visible and calm. */
  resting: boolean;
  /** Push to talk: on once V has been held in this visit (the room's noise no longer starts a turn); V is down now. */
  pushToTalk: boolean;
  talkHeld: boolean;
  /** Set while a shared photo is shown as a 3D splat (SHARP / World Labs): the memory is seen from the photo's eye. */
  photoWorld: { eye: number } | null;
  /** The companion's language on this device: Automatic follows the person, or one pinned language (remembered). */
  language: LanguageSetting;
  /** The companion settings panel (the gear on the start page). */
  settingsOpen: boolean;
  /** The language the companion is speaking right now (captions carry it for screen readers). */
  spoken: Lang;

  set: (patch: Partial<GateState>) => void;
  setStage: (stage: Stage) => void;
  setCompanion: (kind: CompanionKind) => void;
  setWorld: (world: WorldKind) => void;
  toggleCompanion: () => void;
  speakLine: (text: string) => number;
  hearLine: (text: string, interim: boolean) => void;
  clearLines: () => void;
  setLanguage: (setting: LanguageSetting) => void;
}

let lineSeq = 0;

/** The Figure is the companion; ?companion=light brings back the Light for testing (nothing is remembered). */
function initialCompanion(): CompanionKind {
  return new URLSearchParams(location.search).get('companion') === 'light' ? 'light' : 'figure';
}

/** Every visit begins at the palace; ?world=aurora brings back the aurora gate for testing (nothing is remembered). */
function initialWorld(): WorldKind {
  return new URLSearchParams(location.search).get('world') === 'aurora' ? 'aurora' : 'palace';
}

const LANGUAGE_KEY = 'mg.gate.language';

/** The language chosen on this device before, else Automatic (private mode simply starts in Automatic). */
function initialLanguage(): LanguageSetting {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return (LANGUAGE_SETTINGS as readonly string[]).includes(saved ?? '') ? (saved as LanguageSetting) : 'auto';
  } catch { return 'auto'; }
}

export const useGate = create<GateState>((set, get) => ({
  stage: 'portal',
  companion: initialCompanion(),
  world: initialWorld(),
  mood: 'idle',
  expression: 'neutral',
  level: 0,
  companionLine: null,
  heardLine: null,
  media: null,
  offers: { photo: false, video: false, invite: false },
  inviteOpen: false,
  voice: 'off',
  musicOn: true,
  xr: false,
  enterProgress: 0,
  memoryId: null,
  memoryTitle: null,
  session: null,
  invite: null,
  status: '',
  resting: false,
  pushToTalk: false,
  talkHeld: false,
  photoWorld: null,
  language: initialLanguage(),
  settingsOpen: false,
  spoken: deviceLang(navigator.language),

  set: (patch) => set(patch),
  setStage: (stage) => set({ stage }),
  setCompanion: (kind) => set({ companion: kind }),
  toggleCompanion: () => get().setCompanion(get().companion === 'light' ? 'figure' : 'light'),
  setWorld: (world) => set({ world }),
  speakLine: (text) => {
    const id = ++lineSeq;
    set({ companionLine: { id, text, interim: false, at: performance.now() } });
    return id;
  },
  hearLine: (text, interim) => {
    const prev = get().heardLine;
    // Interim words update the same line; a final line becomes a new one.
    const id = prev && prev.interim ? prev.id : ++lineSeq;
    set({ heardLine: { id, text, interim, at: performance.now() } });
  },
  clearLines: () => set({ companionLine: null, heardLine: null }),
  setLanguage: (setting) => {
    set({ language: setting });
    try { localStorage.setItem(LANGUAGE_KEY, setting); } catch { /* private mode: kept for this visit only */ }
  },
}));

/** What the browser's own speech recognition listens for: the pinned language, or the device's in Automatic. */
export function recognitionLang(): string {
  const setting = useGate.getState().language;
  return setting === 'auto' ? navigator.language || 'en-US' : BCP47[setting];
}

/** Stages in which the gate/aurora is the world (before stepping through). */
export const NIGHT_STAGES: readonly Stage[] = ['portal', 'greeting', 'gathering', 'entering'];
export const isNight = (s: Stage) => NIGHT_STAGES.includes(s);
