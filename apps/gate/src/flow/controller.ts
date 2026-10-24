// The conversation that walks someone through the gate. One instance per page. Every step is something the
// companion says or does; the person only ever talks, shares a photo or video, or says they'd like to stop.
//   portal → greeting → gathering (talk / photo / video / someone helps) → entering → forming → memory → leaving → album
import { api } from '../../../../convex/_generated/api';
import { asksToEnter, guideOffline, safeReply, type GuideInput, type GuideReply, type GuideTurn } from '../../../../packages/shared/src/guide';
import { music } from '../audio/music';
import { convex, readInvite, startSession, uploadFile } from '../backend/client';
import { useGate, type MediaItem } from '../state/store';
import { createEngine, type Heard, type VoiceEngine } from '../voice/engine';
import { memory } from './memory';
import { moments } from './moments';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

const NUDGE_MS = 16_000;
const ENTER_MS = 6200;

class Flow {
  private engine: VoiceEngine | null = null;
  private history: GuideTurn[] = [];
  private turnsInPhase = 0;
  private invitedToEnter = false;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private nudges = 0;
  private thinking = false;
  private raf = 0;
  private begun = false;
  private speakingLine: Promise<void> = Promise.resolve();
  private mediaCaption: string | null = null;
  private place: string | null = null;
  private leaving = false;

  constructor() {
    const invite = readInvite();
    if (invite) useGate.getState().set({ invite });
  }

  // ------------------------------------------------------------ the beginning
  async begin(): Promise<void> {
    if (this.begun) return;
    this.begun = true;
    const g = useGate.getState();
    music.start();
    music.setEnabled(g.musicOn);
    music.cue('wake');
    void requestTiltPermission();
    g.set({ stage: 'greeting', expression: 'happy', voice: 'starting', status: '' });
    this.loop();
    const invite = g.invite;
    const session = await startSession({ name: invite ? 'Family' : 'You', invite: invite ? { code: invite.code, key: invite.key } : null });
    useGate.getState().set({ session });
    if (session) memory.attach(session);
    this.engine = await createEngine(session ? { client: convex, code: session.code, token: session.token } : null, {
      onPartial: (text) => { if (!useGate.getState().resting) useGate.getState().hearLine(text, true); },
      onUtterance: (h) => void this.heard(h),
      onSpeechStart: () => { this.clearNudge(); music.duck(true); },
      onProblem: (message, kind) => {
        if (kind === 'blocked') useGate.getState().set({ voice: 'blocked' });
        else if (kind === 'unsupported') useGate.getState().set({ voice: 'unsupported' });
        console.warn('[voice]', message);
      },
    });
    await withTimeout(this.engine.ready, 8000, undefined);
    const v = useGate.getState().voice;
    if (v === 'starting') useGate.getState().set({ voice: this.engine.kind === 'cartesia' ? 'cartesia' : this.engine.kind === 'browser' ? 'browser' : 'unsupported' });
    await sleep(500);
    if (invite) {
      await this.say(`Welcome. You’re joining ${invite.host}. Whatever you share, they’ll see it too.`);
    } else {
      await this.say('Hello. I’m so glad you’re here.');
    }
    await this.say('Is there a moment you’d like to visit today? You can tell me about it, or show me a photo.');
    useGate.getState().set({ stage: 'gathering', offers: { photo: true, video: true, invite: !!session && !invite }, expression: 'neutral' });
    this.listen(true);
    this.scheduleNudge();
  }

  // ------------------------------------------------------------ talking
  /** Say a line: caption, voice, companion animation, music ducked underneath. */
  say(text: string): Promise<void> {
    const line = this.speakingLine.then(async () => {
      const g = useGate.getState();
      if (g.resting && !/rest|ready/i.test(text)) return;
      g.speakLine(text);
      this.history.push({ who: 'companion', text });
      music.duck(true);
      const words = text.split(/\s+/).length;
      try {
        if (this.engine && this.engine.kind !== 'none') await withTimeout(this.engine.say(text), 4000 + words * 650, undefined);
        else await sleep(900 + words * 330);
      } finally {
        music.duck(false);
      }
      await sleep(240);
    });
    this.speakingLine = line.catch(() => undefined);
    return line;
  }

  private listen(on: boolean) {
    this.engine?.setListening(on && !useGate.getState().resting);
  }

  private async heard(h: Heard): Promise<void> {
    const g = useGate.getState();
    if (g.resting || this.leaving) return;
    const text = h.transcript.trim();
    if (!text) return;
    g.hearLine(text, false);
    this.history.push({ who: 'person', text });
    this.clearNudge();
    music.duck(false);
    if (g.stage === 'memory' || g.stage === 'forming') return void this.heardInMemory(text, h);
    if (g.stage !== 'gathering' && g.stage !== 'greeting') return;
    this.turnsInPhase++;
    memory.addWords(text, h.audioFileId);
    this.thinking = true;
    const reply = await this.ask({ phase: 'gathering', transcript: text });
    this.thinking = false;
    if (reply.place) { this.place = reply.place; useGate.getState().set({ memoryTitle: reply.place }); memory.setTitle(reply.place); }
    switch (reply.intent) {
      case 'enter':
        await this.say(reply.reply);
        return void this.enter();
      case 'offer_photo':
      case 'offer_video':
      case 'offer_invite':
        useGate.getState().set({ offers: { photo: true, video: true, invite: reply.intent === 'offer_invite' || useGate.getState().offers.invite } });
        await this.say(reply.reply);
        break;
      case 'leave':
        await this.say(reply.reply);
        return void this.finish();
      case 'rest':
        return void this.rest(reply.reply);
      default:
        // A description: start drawing the place in the background so it's ready (or nearly) when we arrive.
        memory.plan();
        await this.say(reply.reply);
        this.invitedToEnter = asksToEnter(reply.reply);
    }
    this.scheduleNudge();
  }

  private async heardInMemory(text: string, h: Heard): Promise<void> {
    this.thinking = true;
    const reply = await this.ask({ phase: 'memory', transcript: text });
    this.thinking = false;
    if (reply.intent === 'leave') { await this.say(reply.reply); return void this.leave(); }
    if (reply.intent === 'rest') return void this.rest(reply.reply);
    if (reply.intent === 'add_detail') {
      memory.addDetail(text, h.audioFileId);
      moments.mark(text, h.audioFileId);
    }
    await this.say(reply.reply);
  }

  /** Ask the companion's brain: Claude through the backend, else the offline rules. Never longer than ~7 s. */
  private async ask(partial: Pick<GuideInput, 'phase' | 'transcript'>): Promise<GuideReply> {
    const g = useGate.getState();
    const input: GuideInput = {
      ...partial,
      history: this.history.slice(-8),
      media: g.media?.kind ?? null,
      mediaCaption: this.mediaCaption,
      place: this.place,
      invitedToEnter: this.invitedToEnter,
      turnsInPhase: this.turnsInPhase,
    };
    const offline = guideOffline(input);
    if (!g.session) return offline;
    const online = await withTimeout(
      convex.action(api.guide.respond, { code: g.session.code, token: g.session.token, input }) as Promise<GuideReply | null>,
      7000, null,
    );
    if (!online) return offline;
    return { ...online, reply: safeReply(online.reply, offline.reply) };
  }

  // ------------------------------------------------------------ photos and videos
  async receiveFile(file: File): Promise<void> {
    const g = useGate.getState();
    if (!['portal', 'greeting', 'gathering'].includes(g.stage)) return;
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
    if (!kind) return;
    if (file.size > (kind === 'video' ? 250 : 30) * 1024 * 1024) { await this.say('That one is a little too large for me. A smaller copy would be perfect.'); return; }
    if (g.stage === 'portal') await this.begin();
    const media = await describeMedia(file);
    if (!media) { await this.say('I couldn’t open that one. Could you try another?'); return; }
    useGate.getState().set({ media, offers: { photo: false, video: false, invite: false }, expression: 'curious' });
    this.clearNudge();
    this.turnsInPhase = Math.max(this.turnsInPhase, 1);
    const seen = memory.fromMedia(media);
    await this.say(media.kind === 'video' ? 'Oh, I love this.' : 'Oh, look at this.');
    const caption = await withTimeout(seen, 9000, null);
    this.mediaCaption = caption?.caption ?? null;
    if (caption?.title) { this.place = caption.title; useGate.getState().set({ memoryTitle: caption.title }); }
    const ask = caption?.caption ? `I can see ${lowerFirst(caption.caption)}. Where is this place?` : 'Where is this place?';
    await this.say(ask);
    useGate.getState().set({ expression: 'neutral' });
    this.scheduleNudge();
  }

  // ------------------------------------------------------------ stepping through
  async enter(): Promise<void> {
    const g = useGate.getState();
    if (g.stage === 'entering' || g.stage === 'forming' || g.stage === 'memory') return;
    this.clearNudge();
    this.invitedToEnter = false;
    this.listen(false);
    g.set({ stage: 'entering', offers: { photo: false, video: false, invite: false }, enterProgress: 0, heardLine: null });
    g.clearLines();
    memory.plan(); // make sure a plan is on its way (instant if one is already drawn)
    music.cue('enter');
    music.setMode('white');
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / ENTER_MS);
        useGate.getState().set({ enterProgress: p });
        if (p < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    useGate.getState().set({ stage: 'forming', enterProgress: 1, expression: 'gentle' });
    this.turnsInPhase = 0;
    const ready = await memory.whenDrawn(14_000);
    if (!ready) await this.say('It’s coming back to me, little by little.');
    await memory.whenDrawn(20_000);
    useGate.getState().set({ stage: 'memory', expression: 'happy' });
    const intro = memory.introLine() ?? 'Here we are.';
    await this.say(intro);
    moments.mark(intro, null, true);
    useGate.getState().set({ expression: 'neutral' });
    await this.say('Tell me what else was here, or anything you notice. Say when you’d like to leave.');
    this.listen(true);
  }

  // ------------------------------------------------------------ resting, leaving
  async rest(line = 'Of course. Let’s rest here for a moment.'): Promise<void> {
    this.clearNudge();
    await this.say(line);
    this.listen(false);
    this.engine?.hush();
    useGate.getState().set({ resting: true, expression: 'sleepy' });
    music.duck(true);
  }

  async resume(): Promise<void> {
    useGate.getState().set({ resting: false, expression: 'neutral' });
    music.duck(false);
    await this.say('I’m here whenever you’re ready.');
    this.listen(true);
  }

  async leave(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    this.clearNudge();
    this.listen(false);
    const g = useGate.getState();
    if (g.stage === 'memory' || g.stage === 'forming') {
      g.set({ stage: 'leaving', resting: false });
      await moments.captureFinal(this.place);
      await this.say('Thank you for taking me there. I’ve kept this moment for you.');
    }
    await this.finish();
  }

  private async finish(): Promise<void> {
    this.listen(false);
    this.engine?.hush();
    music.setMode('album');
    music.cue('album');
    useGate.getState().set({ stage: 'album', resting: false, heardLine: null, companionLine: null, mood: 'idle' });
  }

  /** From the album: back to the gate for another memory (the session continues). */
  again(): void {
    this.leaving = false;
    this.history = [];
    this.turnsInPhase = 0;
    this.invitedToEnter = false;
    this.mediaCaption = null;
    this.place = null;
    memory.reset();
    moments.reset();
    music.setMode('gate');
    useGate.getState().set({ stage: 'gathering', media: null, memoryTitle: null, offers: { photo: true, video: true, invite: !!useGate.getState().session }, enterProgress: 0 });
    void this.say('Where would you like to go next?').then(() => { this.listen(true); this.scheduleNudge(); });
  }

  setMusic(on: boolean): void {
    useGate.getState().set({ musicOn: on });
    music.setEnabled(on);
  }

  // ------------------------------------------------------------ gentle nudges when it's quiet
  private scheduleNudge() {
    this.clearNudge();
    this.nudgeTimer = setTimeout(() => void this.nudge(), NUDGE_MS + this.nudges * 6000);
  }
  private clearNudge() { if (this.nudgeTimer) clearTimeout(this.nudgeTimer); this.nudgeTimer = null; }
  private async nudge() {
    const g = useGate.getState();
    if (g.stage !== 'gathering' || g.resting || this.engine?.hearing()) return;
    this.nudges++;
    if (this.nudges === 1) {
      g.set({ offers: { photo: true, video: true, invite: !!g.session && !g.invite } });
      await this.say(g.media ? 'Take your time. Whenever you’re ready, we can step inside.' : 'Take your time. If it’s easier, a photo can help us find the way.');
      if (g.media) this.invitedToEnter = true;
    } else if (this.nudges === 2 && g.media) {
      await this.say('Shall we go and see it?');
      this.invitedToEnter = true;
    } else if (this.nudges <= 3) {
      await this.say('There’s no hurry. I’m right here.');
    }
    if (this.nudges < 4) this.scheduleNudge();
  }

  // ------------------------------------------------------------ the companion's body follows the voice
  private loop() {
    const tick = () => {
      const g = useGate.getState();
      const e = this.engine;
      let mood = g.mood;
      if (g.resting) mood = 'idle';
      else if (e?.hearing()) mood = 'listening';
      else if (e?.speaking()) mood = 'speaking';
      else if (this.thinking) mood = 'thinking';
      else mood = g.stage === 'gathering' || g.stage === 'memory' ? 'listening' : 'idle';
      const level = e ? (e.hearing() || e.speaking() ? e.level() : 0) : 0;
      if (mood !== g.mood || Math.abs(level - g.level) > 0.01) g.set({ mood, level });
      this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------ test hooks (Playwright / dogfood loop)
  /** Simulate a finished utterance (tests can't speak into a microphone). */
  testHear(text: string) { return this.heard({ transcript: text, audioFileId: null, durationMs: 0 }); }
}

function lowerFirst(s: string) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

async function requestTiltPermission() {
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  try { if (typeof D.requestPermission === 'function') await D.requestPermission(); } catch { /* parallax is optional */ }
}

/** Reads a photo or video into a MediaItem (object URL, size, a poster frame for videos). */
async function describeMedia(file: File): Promise<MediaItem | null> {
  const url = URL.createObjectURL(file);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  try {
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await new Promise<void>((resolve, reject) => { v.onloadeddata = () => resolve(); v.onerror = () => reject(new Error('video')); setTimeout(() => resolve(), 6000); });
      v.currentTime = Math.min(1.2, (v.duration || 2) * 0.3);
      await new Promise<void>((r) => { v.onseeked = () => r(); setTimeout(r, 1500); });
      const c = document.createElement('canvas');
      const w = v.videoWidth || 1280, h = v.videoHeight || 720;
      const scale = Math.min(1, 1280 / Math.max(w, h));
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      const poster = c.toDataURL('image/jpeg', 0.86);
      return { id, kind: 'video', url, name: file.name, width: w, height: h, poster, file };
    }
    const img = new Image();
    img.src = url;
    await img.decode();
    return { id, kind: 'photo', url, name: file.name, width: img.naturalWidth, height: img.naturalHeight, file };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export const flow = new Flow();
export { uploadFile };
// Exposed for the dogfood loop and Playwright: drive the conversation without a microphone.
(window as unknown as { __gate: unknown }).__gate = { flow, store: useGate, memory, moments };
