// The conversation that walks someone through the gate. One instance per page. Every step is something the
// companion says or does; the person only ever talks, shares a photo or video, or says they'd like to stop.
//   portal → greeting → gathering (talk / photo / video / someone helps) → entering → forming → memory → leaving → album
import { api } from '../../../../convex/_generated/api';
import { asksToEnter, asksToGoIn, asksToLeave, guideOffline, safeReply, saysYes, type GuideInput, type GuideReply, type GuideTurn } from '../../../../packages/shared/src/guide';
import { music } from '../audio/music';
import { convex, readInvite, startSession, uploadFile } from '../backend/client';
import { useGate, type MediaItem } from '../state/store';
import { createEngine, silentEngine, type Heard, type VoiceEngine } from '../voice/engine';
import { validatePlan } from '../../../../packages/shared/src/scene';
import { fileUrl } from '../backend/client';
import { memory } from './memory';
import { moments, useMoments } from './moments';
import type { SharedMemory } from './sync';
import { PALACE_ENTER_MS } from '../scene/palace/plan';
import { placeFor, placePlan, PLACES, type PlaceKey } from '../../../../packages/shared/src/places';
import type { ScenePlan } from '../../../../packages/shared/src/scene';
import { useMemory } from './memory';
import { guideContext, story, turn } from '../social/attribution';
import { overlayActive } from '../social/overlay';
import { visitFromUrl } from '../album/prepared';
import { useAtlas, type PlaceId } from '../map/state';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** A visit opened as the Red Kite meadow (?memory=red-kite, backend/client.ts): its memory is that place. */
const OPENED_AS_MEADOW = new URLSearchParams(location.search).get('memory') === 'red-kite';
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
  /** Counts questions to the companion's brain while gathering, so only the newest answer is said. */
  private askSeq = 0;
  private raf = 0;
  private begun = false;
  private speakingLine: Promise<void> = Promise.resolve();
  private mediaCaption: string | null = null;
  private place: string | null = null;
  private leaving = false;
  /** Everything said while gathering (a prepared place is recognised from all of it together). */
  private said: string[] = [];

  constructor() {
    const invite = readInvite();
    if (invite) useGate.getState().set({ invite });
  }

  // ------------------------------------------------------------ the beginning
  async begin(): Promise<void> {
    // Back at the start page after a visit (the album's ×): Begin starts the next visit in the same session.
    if (this.begun) { if (useGate.getState().stage === 'portal') this.again(); return; }
    // ?visit=red-kite: straight into that sample, with the things it holds (for checking a place quickly).
    const shortcut = visitFromUrl();
    if (shortcut) return this.visitPlace(shortcut.key, shortcut.plan);
    const { invite, session } = await this.setup(true);
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

  /** What every visit needs before anyone speaks: sound (the tap that got here is the gesture), the session, the voice. */
  private async setup(greeting: boolean) {
    this.begun = true;
    const g = useGate.getState();
    // Joining a visit in the same room: this device stays quiet (no music, no voice of its own); the main device
    // listens and speaks for everyone, and this one shows the words and the place.
    const quiet = !!g.invite;
    if (quiet) g.set({ musicOn: false });
    music.start();
    music.setEnabled(quiet ? false : g.musicOn);
    music.cue('wake');
    void requestTiltPermission();
    g.set(greeting ? { stage: 'greeting', expression: 'happy', voice: 'starting', status: '' } : { voice: 'starting', status: '' });
    this.loop();
    const invite = g.invite;
    const session = await startSession({ name: invite ? 'Family' : 'You', invite: invite ? { code: invite.code, key: invite.key } : null });
    useGate.getState().set({ session });
    if (session) memory.attach(session);
    this.engine = quiet ? silentEngine() : await createEngine(session ? { client: convex, code: session.code, token: session.token } : null, {
      onPartial: (text) => { if (!useGate.getState().resting) useGate.getState().hearLine(text, true); },
      onUtterance: (h) => void this.heard(h),
      onSpeechStart: () => { this.clearNudge(); music.duck(true); },
      onProblem: (message, kind) => {
        if (kind === 'blocked') useGate.getState().set({ voice: 'blocked' });
        else if (kind === 'unsupported') useGate.getState().set({ voice: 'unsupported' });
        console.warn('[voice]', message);
        // A turn lost to the network: say so kindly and ask again, rather than leaving a silence.
        if (/dropped|wasn.t heard|couldn.t be saved/i.test(message) && !useGate.getState().resting) void this.say('I’m sorry, I missed that. Could you say it again?');
      },
    });
    // Don't wait for the listening socket before saying hello: speech only needs the voice token (about a second).
    for (let i = 0; i < 30 && !this.engine.canSpeak(); i++) await sleep(100);
    const v = useGate.getState().voice;
    if (v === 'starting') useGate.getState().set({ voice: quiet ? 'shared' : this.engine.kind === 'cartesia' ? 'cartesia' : this.engine.kind === 'browser' ? 'browser' : 'unsupported' });
    return { quiet, invite, session };
  }

  // ------------------------------------------------------------ talking
  /** Say a line: caption, voice, companion animation, music ducked underneath. */
  say(text: string): Promise<void> {
    const line = this.speakingLine.then(async () => {
      const g = useGate.getState();
      if (g.resting && !/rest|ready/i.test(text)) return;
      g.speakLine(text);
      this.history.push({ who: 'companion', text });
      turn('companion', text); // inside a memory: into the viewing perspective's thread
      music.duck(true);
      const words = text.split(/\s+/).length;
      try {
        if (this.engine) await withTimeout(this.engine.say(text), 4000 + words * 650, undefined);
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
    turn('person', text);
    this.clearNudge();
    music.duck(false);
    const beforeMemory = g.stage === 'gathering' || g.stage === 'greeting';
    // "Yes" to "Shall we go and see it?", or "let's go" once there's somewhere to go: step through at once, without
    // waiting on a model (and before the gate, "let's go" is never taken for goodbye).
    if (beforeMemory && ((this.invitedToEnter && saysYes(text)) || (asksToGoIn(text) && this.somewhereToGo()))) {
      this.askSeq++; // a reply still on its way is not said over the walk
      this.thinking = false;
      await this.say('Come with me.');
      return void this.enter();
    }
    // "I'd like to leave", "take me back", "I'm done": acted on at once, without waiting on a model, so leaving always
    // works (even offline, even on a slow connection).
    if (asksToLeave(text) && !(beforeMemory && asksToGoIn(text)) && ['memory', 'forming', 'gathering', 'greeting'].includes(g.stage)) {
      if (g.stage === 'memory' || g.stage === 'forming') return void this.leave();
      await this.say('Of course. Thank you for spending this time with me.');
      return void this.finish();
    }
    if (g.stage === 'memory' || g.stage === 'forming') return void this.heardInMemory(text, h);
    if (g.stage !== 'gathering' && g.stage !== 'greeting') return;
    this.turnsInPhase++;
    this.placeWords(text);
    this.thinking = true;
    const mine = ++this.askSeq;
    const reply = await this.ask({ phase: 'gathering', transcript: text });
    if (mine === this.askSeq) this.thinking = false;
    // Only words that describe the place feed the drawing ("yes, let's go" doesn't).
    if (reply.intent === 'describe' || (reply.intent === 'chat' && text.split(/\s+/).length >= 5)) memory.addWords(text, h.audioFileId);
    if (reply.place) { this.place = reply.place; useGate.getState().set({ memoryTitle: reply.place }); memory.setTitle(reply.place); }
    // They spoke again while this was on its way, or are already stepping through: it's no longer the line to say.
    if (mine !== this.askSeq || !['gathering', 'greeting'].includes(useGate.getState().stage)) return;
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
    // In a prepared place, naming a thing brings it in at once (from the library, to its spot in that world).
    const brought = memory.bringIn(text);
    if (brought) setTimeout(() => void moments.mark(text, h.audioFileId), 1800); // the picture once it has formed
    this.thinking = true;
    const reply = await this.ask({ phase: 'memory', transcript: text });
    this.thinking = false;
    if (reply.intent === 'leave') { await this.say(reply.reply); return void this.leave(); }
    if (reply.intent === 'rest') return void this.rest(reply.reply);
    if (reply.intent === 'add_detail' && !brought) {
      // Seeing through someone's eyes (and the exchange is keeping perspectives): it becomes that perspective's own
      // story and things in the place. Otherwise the shared memory grows, as always. (In a prepared place, named
      // things were already brought in above.)
      if (overlayActive()) void story(text, { audioFileId: h.audioFileId, addsThings: true });
      else memory.addDetail(text, h.audioFileId);
      moments.mark(text, h.audioFileId);
    } else if (reply.intent === 'chat' && text.split(/\s+/).length >= 5) {
      void story(text, { audioFileId: h.audioFileId });
    }
    await this.say(reply.reply);
  }

  // ------------------------------------------------------------ prepared places from the library
  /** There is a place to step into: a prepared place, a named one, a shared photo, or something already described. */
  private somewhereToGo(): boolean {
    return !!(useMemory.getState().place || this.place || useGate.getState().media || this.turnsInPhase >= 1);
  }

  /** Words that describe a prepared place (the courtyard, the meadow) make the visit step into it; things named
   *  come in from the library. Recognised from everything said so far, so details can arrive across turns. A visit
   *  opened as the meadow steps into it whatever is said first (a few misheard words never sketch a room inside it). */
  private placeWords(text: string) {
    this.said.push(text);
    if (!useMemory.getState().place) {
      const p = placeFor(this.said.join(' ')) ?? (OPENED_AS_MEADOW ? PLACES['red-kite'] : null);
      if (!p) return;
      memory.usePlace(p, this.place);
      this.activatePlace(p.key);
      for (const earlier of this.said.slice(0, -1)) memory.bringIn(earlier);
    }
    memory.bringIn(text);
  }

  /** The room's place becomes the prepared world (the host's device asks; everyone in the visit sees it). */
  private activatePlace(key: PlaceKey) {
    const s = useGate.getState().session;
    if (!s || s.role !== 'host') return;
    void (async () => {
      // A busy backend can run a call past its time limit: keep asking for about ten seconds (there's a walk to cross).
      for (let i = 0; i < 5; i++) {
        try { await convex.mutation(api.splats.usePreparedPlace, { code: s.code, token: s.token, place: key }); return; }
        catch (e) { console.warn('[place] world', e); await sleep(1000 * (i + 1)); }
      }
    })();
  }

  /** Resolves true once the prepared world is showing (it fades in over a couple of seconds), false on timeout. */
  private worldShown(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const check = () => {
        if (useGate.getState().photoWorld) return void setTimeout(() => resolve(true), 2600);
        if (performance.now() - t0 > ms) return resolve(false);
        setTimeout(check, 150);
      };
      check();
    });
  }

  /** From the album: step straight into a prepared place, with the things its memory holds. */
  async visitPlace(key: PlaceKey, plan: ScenePlan | null = null): Promise<void> {
    if (!this.begun) await this.setup(false);
    this.leaving = false;
    this.history = [];
    this.said = [];
    this.invitedToEnter = false;
    this.place = plan?.title ?? PLACES[key].title;
    memory.restore(plan ?? placePlan(PLACES[key]), key);
    moments.reset();
    this.activatePlace(key);
    useGate.getState().set({ memoryTitle: this.place, media: null, offers: { photo: false, video: false, invite: false } });
    await this.enter();
  }

  /** Ask the companion's brain: Claude through the backend, else the offline rules. Never longer than ~7 s. */
  private async ask(partial: Pick<GuideInput, 'phase' | 'transcript'>): Promise<GuideReply> {
    const g = useGate.getState();
    // Inside a memory, the companion speaks to whoever's eyes the place is seen through, with that perspective's thread.
    const seen = guideContext();
    const input: GuideInput = {
      ...partial,
      history: seen && seen.history.length >= 2 ? seen.history : this.history.slice(-8),
      ...(seen ? { perspective: seen.perspective } : {}),
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
    const walkMs = useGate.getState().world === 'palace' ? PALACE_ENTER_MS : ENTER_MS; // the palace is a place you cross
    await new Promise<void>((resolve) => {
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / walkMs);
        useGate.getState().set({ enterProgress: p });
        if (p < 1) nextTick(step); else resolve();
      };
      nextTick(step);
    });
    useGate.getState().set({ stage: 'forming', enterProgress: 1, expression: 'gentle' });
    this.turnsInPhase = 0;
    // Listening again as soon as the place starts forming: whatever they say while it appears is heard and answered.
    this.listen(true);
    // A prepared place is ready when its world is showing; a sketched one when most of it has formed.
    const prepared = !!useMemory.getState().place;
    const ready = prepared ? await this.worldShown(14_000) : await memory.whenDrawn(14_000);
    if (!ready) await this.say('It’s coming back to me, little by little.');
    if (prepared && !ready && !(await this.worldShown(16_000))) {
      // The world didn't come (no backend, or it was never loaded): draw the place from the words instead.
      memory.leavePlace();
      memory.plan();
    }
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
    useAtlas.getState().show('sf', 'mine'); // the album, where the moment just kept is
    useGate.getState().set({ stage: 'album', resting: false, heardLine: null, companionLine: null, mood: 'idle' });
  }

  /** A guest follows the host: into the same place, and every detail added after. */
  async followHost(shared: SharedMemory): Promise<void> {
    if (!shared.plan) return;
    const plan = validatePlan(shared.plan);
    const g = useGate.getState();
    memory.adopt(plan, shared.id, shared.mediaUrl ? fileUrl(shared.mediaUrl) : null, shared.place ?? null);
    g.set({ memoryTitle: plan.title });
    if (g.stage === 'gathering' || g.stage === 'greeting') {
      this.clearNudge();
      await this.say(`${shared.byName && shared.byName !== 'You' ? shared.byName : 'Your family'} is visiting ${plan.title}. Let’s go with them.`);
      await this.enter();
    }
  }

  /** The host, still at the gate, receives a photo a family member sent from their phone. */
  async welcomeGuestPhoto(shared: SharedMemory): Promise<void> {
    const g = useGate.getState();
    if (g.stage !== 'gathering' || g.media || !shared.mediaUrl) return;
    const url = fileUrl(shared.mediaUrl);
    if (!url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    try { await img.decode(); } catch { return; }
    this.clearNudge();
    g.set({ media: { id: shared.id, kind: 'photo', url, name: 'shared photo', width: img.naturalWidth, height: img.naturalHeight }, offers: { photo: false, video: false, invite: false }, expression: 'curious' });
    if (shared.plan) memory.adopt(validatePlan(shared.plan), shared.id, url);
    this.turnsInPhase = Math.max(this.turnsInPhase, 1);
    if (shared.title) { this.place = shared.title; g.set({ memoryTitle: shared.title }); }
    this.mediaCaption = shared.caption ?? null;
    await this.say(`${shared.byName ?? 'Someone'} sent a photo. Oh, look at this.`);
    await this.say(shared.caption ? `I can see ${lowerFirst(shared.caption)}. Where is this place?` : 'Where is this place?');
    useGate.getState().set({ expression: 'neutral' });
    this.scheduleNudge();
  }

  /** From the album: walk back into a memory exactly as it was. */
  async revisit(memoryId: string): Promise<void> {
    const m = useMoments.getState().memories.find((x) => x.id === memoryId);
    if (!m?.plan) { this.again(); return; }
    this.leaving = false;
    this.history = [];
    this.invitedToEnter = false;
    this.place = m.title;
    memory.restore(m.plan, m.place ?? null);
    if (m.place) this.activatePlace(m.place);
    moments.resume(memoryId);
    music.setMode('white');
    music.cue('enter');
    const g = useGate.getState();
    g.set({ stage: 'entering', enterProgress: 0.55, memoryTitle: m.title, media: null, offers: { photo: false, video: false, invite: false } });
    g.clearLines();
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const p = Math.min(1, 0.55 + (performance.now() - t0) / 3600 * 0.45);
        useGate.getState().set({ enterProgress: p });
        if (p < 1) nextTick(step); else resolve();
      };
      nextTick(step);
    });
    useGate.getState().set({ stage: 'forming', enterProgress: 1, expression: 'gentle' });
    await memory.whenDrawn(16_000);
    useGate.getState().set({ stage: 'memory', expression: 'happy' });
    await this.say('Here we are again.');
    useGate.getState().set({ expression: 'neutral' });
    this.listen(true);
  }

  /** From the start page: the memory map (earlier visits on this device are its San Francisco pin), before any
   *  conversation begins; or straight onto one place's memories. */
  openAlbum(place: PlaceId | null = null): void {
    const g = useGate.getState();
    if (g.stage !== 'portal') return;
    music.start();
    music.setEnabled(g.musicOn);
    music.setMode('album');
    useAtlas.getState().show(place, 'mine'); // the memory map, or that place
    g.set({ stage: 'album' });
  }

  /** From the album's ×: back to the start page. The session continues; Begin (or the album link) from there. */
  home(): void {
    this.leaving = false;
    this.history = [];
    this.turnsInPhase = 0;
    this.invitedToEnter = false;
    this.mediaCaption = null;
    this.place = null;
    this.said = [];
    this.clearNudge();
    this.listen(false);
    memory.reset();
    moments.reset();
    music.setMode('gate');
    useGate.getState().set({ stage: 'portal', media: null, memoryTitle: null, offers: { photo: false, video: false, invite: false }, enterProgress: 0, heardLine: null, companionLine: null, resting: false });
  }

  /** From the album: back to the gate for another memory (the session continues). */
  again(): void {
    // Opened from the start page: nothing has begun yet, so this is the first visit.
    if (!this.begun) { useGate.getState().set({ stage: 'portal' }); void this.begin(); return; }
    this.leaving = false;
    this.history = [];
    this.turnsInPhase = 0;
    this.invitedToEnter = false;
    this.mediaCaption = null;
    this.place = null;
    this.said = [];
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
      this.raf = nextTick(tick);
    };
    clearTimeout(this.raf);
    this.raf = nextTick(tick);
  }

  // ------------------------------------------------------------ test hooks (Playwright / dogfood loop)
  /** Simulate a finished utterance (tests can't speak into a microphone). */
  testHear(text: string) { return this.heard({ transcript: text, audioFileId: null, durationMs: 0 }); }
}

/** About 60 times a second, everywhere. Window animation frames can pause in a headset during an immersive session
 *  (the page itself isn't drawn); timers keep running, so the walk and the companion's mood never stall in VR. */
function nextTick(fn: () => void): number { return window.setTimeout(fn, 16); }

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
(window as unknown as { __gate: unknown }).__gate = { flow, store: useGate, memory, moments, memoryStore: useMemory };
