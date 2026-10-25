// One conversation with everyone in the visit: this device's side of it. It is the same companion as ever (its brain,
// voice and figure); the exchange gateway (services/exchange/conversation.mjs) keeps the conversation in SpacetimeDB,
// hears every microphone in the room, and asks the companion once for everyone. Every device listens: each finished
// utterance is offered to it first, and it answers whether these were this person's own words (the same words heard
// by both microphones count once, for the louder; the other person heard faintly across the room doesn't count)
// before anything here acts on them. Every line the companion says reaches every device, to be spoken and captioned.
// Without the exchange, the host talks with the companion directly, as always, and a joined device stays quiet.
import { deviceKind, usePresence } from '../presence/presence';
import { socialLink } from '../social/link';
import { MEADOW_CAST, poses, useSocial } from '../social/store';
import { useGate } from '../state/store';
import type { Heard, VoiceEngine } from '../voice/engine';

/** A companion line, to everyone in the room. `heard`: what it was answering (each person's words). `detailFor` /
 *  `intentFor`: whose device adds the detail / acts on a personal intent (resting, leaving). */
export type CompanionLine = {
  type: 'companion'; id: string; text: string; intent: string; place?: string | null; invites?: boolean; scripted?: boolean;
  /** The conversation language after this turn, and the language the line is voiced in (they differ for a pinned one). */
  language?: string | null; speakIn?: string | null;
  /** The English reading of Spanish or French words just said (prepared places know English words). */
  english?: string | null;
  /** A line of the companion's own (flow/lines.ts) each device says in its own language, with `name` filled in. */
  line?: 'joinedToo' | 'allHere'; name?: string | null;
  detailFor?: string | null; intentFor?: string; heard?: { memberId: string; name: string; text: string }[];
};
export type RoomVoice = CompanionLine | { type: 'hush' };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** The room's lines this device received (for the automated checks, like window.__people). */
const received: { id: string; text: string; intent: string; language: string | null; heard: string[] }[] = [];
(window as unknown as { __roomLines?: typeof received }).__roomLines = received;
const isGuest = () => !!useGate.getState().invite;
const uuid = () => crypto.randomUUID();

export const companion = {
  /** The room's companion is here (the exchange is connected and holding this visit). */
  live: () => socialLink.ready,
  isGuest,
  /** The host's device runs the visit: the place, stepping through, the album. */
  leads: () => !isGuest(),
  me: () => useSocial.getState().memberId,
  /** Nobody else is in the visit right now (their words can't be mistaken for this person's). */
  alone: () => usePresence.getState().others.length === 0,

  /** Were these this person's own words? While the companion isn't here, only the host's are. (The link drops for
   *  a moment when the page reconnects, entering VR say: a guest waits for it rather than losing the words.) */
  async claim(h: Heard, lang: { language: string; setting: string } = { language: 'en', setting: 'auto' }): Promise<boolean> {
    if (!socialLink.ready && isGuest()) await companion.whenLive(2500);
    if (!socialLink.ready) return !isGuest();
    try {
      const r = (await socialLink.call({
        type: 'utterance', turnId: h.turnId, text: h.transcript.slice(0, 600), snrDb: Math.round(h.snrDb * 10) / 10, durationMs: Math.max(0, Math.round(h.durationMs)),
        device: deviceKind(useGate.getState().xr), language: lang.language, setting: lang.setting, ...(h.audioFileId ? { audioFileId: h.audioFileId } : {}),
      }, 6000)) as { own?: boolean } | undefined;
      return r?.own !== false;
    } catch {
      return !isGuest(); // the exchange went away mid-turn: as without it
    }
  },
  /** Someone started talking here (the companion never speaks over them), or a turn ended with nothing heard. */
  hearing(turnId: string, end = false) { socialLink.post({ type: 'hearing', turnId, ...(end ? { end: true } : {}) }); },
  /** The host's view of the visit, for the companion's next answer. */
  postFlow(state: { stage: string; turnsInPhase: number; invitedToEnter: boolean; place: string | null; media: 'photo' | 'video' | null; mediaCaption: string | null }) {
    // Who the perspectives are in this memory (the meadow: young grandma and her friend), for the companion's words.
    const cast = useSocial.getState().cast === 'meadow' ? { grandparent: MEADOW_CAST.grandparent.label, child: MEADOW_CAST.child.label } : null;
    if (socialLink.ready && !isGuest()) void socialLink.call({ type: 'flow', ...state, cast }).catch(() => undefined);
  },
  /** One of the host's own lines (a welcome, "Here we are", a nudge): heard on the other devices too. */
  postLine(text: string, language: string | null = null) { if (socialLink.ready) void socialLink.call({ type: 'line', commandId: uuid(), text: text.slice(0, 300), ...(language ? { language } : {}) }).catch(() => undefined); },
  /** This person spoke over the companion: it stops everywhere. */
  hush() { if (socialLink.ready) void socialLink.call({ type: 'hush' }).catch(() => undefined); },
  onVoice(fn: (d: RoomVoice) => void) {
    socialLink.onVoice(((d: RoomVoice) => {
      if (d.type === 'companion') { received.push({ id: d.id, text: d.text, intent: d.intent, language: d.language ?? null, heard: (d.heard ?? []).map((h) => h.name) }); if (received.length > 60) received.shift(); }
      fn(d);
    }) as (d: { type: string }) => void);
  },

  /** Wait (briefly) for the room's companion, e.g. before a guest's first words. */
  async whenLive(ms: number): Promise<boolean> {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) if (socialLink.ready) return true;
    return socialLink.ready;
  },
  /** A guest steps through once the host actually has (their head is inside the memory), not when a plan is saved
   *  while they're still talking at the gate. */
  async whenHostInside(ms: number): Promise<boolean> {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) {
      const host = usePresence.getState().others.find((o) => o.host);
      if (host && poses.get(host.id)?.inScene) return true;
    }
    return false;
  },

  /** A guest's voice: it listens, and speaks its own lines, only while the room's companion is here. */
  guarded(engine: VoiceEngine): VoiceEngine {
    let wanted = false;
    const apply = () => engine.setListening(wanted && socialLink.ready);
    const timer = setInterval(apply, 1000);
    return {
      get kind() { return engine.kind; },
      ready: engine.ready,
      say: (text, language) => (socialLink.ready ? engine.say(text, language) : sleep(700 + text.split(/\s+/).length * 260)),
      hush: () => engine.hush(),
      setListening: (on) => { wanted = on; apply(); },
      pushToTalk: (down) => engine.pushToTalk(down),
      level: () => engine.level(),
      canSpeak: () => engine.canSpeak(),
      speaking: () => engine.speaking(),
      hearing: () => engine.hearing(),
      dispose: () => { clearInterval(timer); engine.dispose(); },
    };
  },
};
