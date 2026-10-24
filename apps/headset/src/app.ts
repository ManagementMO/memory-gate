// Memory Gate headset: joins a room, renders its splat memory with spoken objects, runs push-to-talk, the companion
// light and captions, replay, pause and heartbeat. Everything shown comes from the backend; this file reconciles.
// Sample content only (public-domain 1938 photo, fictional lines). "Supports reminiscence", never treatment.
// URL switches: ?room=CODE  ?convex=<url>  ?multiview=on  ?scale=0.75  ?tm=none|aces  ?fov=46  ?hud=1  ?voice=mock
import type { World } from '@iwsdk/core';
import * as THREE from '@iwsdk/core';
import type { ConvexClient } from 'convex/browser';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { SplatRoom, makeSpark } from './room.js';
import { ObjectLayer, type ObjectRecord } from './objects.js';
import { Keepsakes } from './keepsakes';
import { Motes, makeDust } from './look/motes.js';
import { Companion, type CompanionState } from './look/companion.js';
import { Captions } from './look/captions.js';
import { Chimes } from './look/chime.js';
import { VIEWPORT_H } from './look/palette.js';
import { api, errorCode, fileUrl, humanError, joinRoom, makeClient, newCommandId, roomCodeFromUrl, type Session } from './net.js';
import { createUi, type TickerItem } from './ui.js';
import { resolveVoiceFactory, type VoiceFactory } from './voiceLoader.js';
import { createStubVoice, setStubTranscriptSource } from './voiceStub.js';
import type { Voice, VoiceOptions, VoiceState } from './voiceTypes.js';
import { rayFrom, toPointer, type Pointer, type PointerSource } from './pointer.js';

type RoomView = FunctionReturnType<typeof api.rooms.get>;
type Utterance = FunctionReturnType<typeof api.utterances.recent>[number];
type RoomEvent = FunctionReturnType<typeof api.objects.events>[number];

type Stats = Record<string, unknown>;
declare global {
  interface Window { __mg: { stats: Stats; [k: string]: unknown } }
}

declare const __MG_FIXTURES__: string;
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export async function startApp(world: World): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV && (params.get('check') === 'models' || params.get('check') === 'objects')) {
    const { modelCheck, objectCheck } = await import('./check.js');
    return params.get('check') === 'models' ? modelCheck(world, __MG_FIXTURES__) : objectCheck(world, __MG_FIXTURES__);
  }
  const stats: Stats = { phase: 'starting', tStart: Math.round(performance.now()) };
  const mg: Window['__mg'] = { stats };
  window.__mg = mg;
  const ui = createUi();
  // Spectator view (?view=spectator): a read-only projector page for people without the headset. No controls, a
  // story ticker, bigger captions, a steady camera (?drift=1 opts into drift), silent unless ?audio=1.
  const spectator = params.get('view') === 'spectator';
  const audioWanted = !spectator || params.get('audio') === '1';
  const driftOn = spectator && params.get('drift') === '1';
  if (spectator) ui.setSpectator();
  const chimes = new Chimes();
  chimes.muted = !audioWanted;
  Object.assign(stats, { spectator, audio: audioWanted, drift: driftOn });

  // ---------- renderer settings that must be in place before Enter XR (V14/V23) ----------
  const multiview = params.get('multiview') === 'on';
  if (!multiview) {
    const ext = world.renderer.extensions as unknown as { has: (n: string) => boolean };
    const has = ext.has.bind(ext);
    ext.has = (n: string) => (n === 'OCULUS_multiview' ? false : has(n));
  }
  const fbScale = Number(params.get('scale') || 0.75);
  world.renderer.xr.setFramebufferScaleFactor(fbScale);
  world.renderer.shadowMap.enabled = false;
  // Splats are unlit and Spark writes sRGB without tone mapping, so tone mapping would only touch the GLB objects.
  // NoToneMapping keeps objects in the same tonal space as the photo; ?tm=aces is kept for A/B.
  const tm = params.get('tm') === 'aces' ? 'aces' : 'none';
  world.renderer.toneMapping = tm === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  world.renderer.toneMappingExposure = 1.0;
  const DESKTOP_BG = new THREE.Color(0x0d0a07);
  world.scene.background = DESKTOP_BG;
  const fov = Number(params.get('fov') || 0);
  if (fov > 10 && fov < 120) { world.camera.fov = fov; world.camera.updateProjectionMatrix(); }
  Object.assign(stats, { multiview, fbScale, toneMapping: tm, threeRevision: THREE.REVISION });

  // ---------- scene graph ----------
  const spark = makeSpark(world.renderer);
  world.scene.add(spark);
  const memoryRoot = new THREE.Group();
  memoryRoot.name = 'memory-root';
  const memoryEntity = world.createTransformEntity(memoryRoot, { persistent: true });
  const room = new SplatRoom();
  memoryRoot.add(room.root);
  const fallback = world.scene.getObjectByName('CourtyardFallback') ?? world.scene.getObjectByName('IllustrativeCourtyard');
  if (fallback) memoryRoot.add(fallback);
  const motes = new Motes();
  world.scene.add(motes.points);
  const dust = makeDust();
  memoryRoot.add(dust.points);
  const objects = new ObjectLayer(motes);
  memoryRoot.add(objects.root);
  const keepsakes = new Keepsakes(world, memoryEntity);
  objects.onViewReady = (record, view) => keepsakes.attach(record, view);
  objects.onViewDisposed = id => keepsakes.remove(id);
  const companion = new Companion();
  companion.visibleTarget = 0;
  world.scene.add(companion.root);
  const captions = new Captions();
  // Desktop preview: the card floats high (over the ceiling) so the room and the 2D panel stay clear; in XR it sits
  // below the line of sight (-0.34 m at 1.15 m), set on session start.
  const DESKTOP_CAPTION = spectator ? { drop: 0.25, scale: 1.08 } : { drop: 0.22, scale: 0.85 };
  captions.drop = DESKTOP_CAPTION.drop;
  captions.mesh.scale.setScalar(DESKTOP_CAPTION.scale);
  world.scene.add(captions.mesh);
  // Lights exist from load (adding one mid-session recompiles every lit material); they only light the GLB solids.
  const key = new THREE.DirectionalLight(0xfff0d6, 1.65);
  key.position.set(-4, 7, 2);
  memoryRoot.add(key, key.target);
  memoryRoot.add(new THREE.HemisphereLight(0xdce8e9, 0x77715a, 0.72));
  if (params.get('debug') === 'floor') {
    // Dev aid: the memory's floor plane (y = 0) as a 0.5 m grid, plus an optional side camera (?cam=side|top).
    const grid = new THREE.GridHelper(12, 24, 0x66ccff, 0x2f86b8);
    grid.position.set(0, 0.002, -4);
    Object.assign(grid.material as THREE.Material, { depthTest: false, transparent: true, opacity: 0.85 });
    grid.renderOrder = 2002;
    memoryRoot.add(grid);
  }

  // ---------- state ----------
  let client: ConvexClient | null = null;
  let session: Session | null = null;
  let voice: Voice | null = null;
  let voiceIsReal = false;
  let voiceFactory: VoiceFactory | null = null;
  let voiceOpts: VoiceOptions | null = null;
  let voiceState: VoiceState = 'idle';
  let roomView: RoomView | null = null;
  let loadedSplatId: string | null = null;
  let liteRoom = false;
  let pendingScale: number | null = null;
  let paused = false;
  let memoryOpen = false;
  let lastOpenedAt: number | null | undefined;
  let latestPending = false;
  let pendingCorrectionId: Id<'corrections'> | null = null;
  let speaking: { id: string; intent: string | null } | null = null;
  const handled = new Set<string>();
  const shownLine = new Set<string>();
  let firstUtterances = true;

  const report = (msg: string) => {
    stats.lastError = msg;
    ui.error(msg);
    if (world.renderer.xr.isPresenting) captions.show('Memory Gate', msg, null, { holdS: 4 });
  };
  objects.onError = report;

  // ---------- desktop camera at the photo's camera ----------
  const placeDesktopCamera = () => {
    if (world.renderer.xr.isPresenting) return;
    const cam = params.get('cam');
    if (cam === 'side' || cam === 'top') {
      if (cam === 'side') world.camera.position.set(7, 1.6, -3.5); else world.camera.position.set(0, 11, -3.6);
      world.camera.lookAt(0, cam === 'side' ? 0.8 : 0, -3.5);
      world.camera.updateMatrixWorld(true);
      return;
    }
    if (roomView?.room.layout === 'courtyard' || (spectator && fallback && !room.ready)) {
      world.camera.position.set(0, 1.62, 1.9);
      world.camera.lookAt(0, 1.25, -4.6);
      world.camera.updateMatrixWorld(true);
      captions.drop = -.34;
      captions.mesh.scale.setScalar(.85);
      return;
    }
    captions.drop = DESKTOP_CAPTION.drop;
    captions.mesh.scale.setScalar(DESKTOP_CAPTION.scale);
    world.camera.position.set(0, room.eyeHeight, 0);
    world.camera.rotation.set(0, 0, 0);
    world.camera.updateMatrixWorld(true);
  };

  // ---------- XR session: recenter the memory at the head (yaw only), passthrough background ----------
  let recenterPending = false;
  let recenterFrames = 0;
  const recenter = () => { recenterPending = true; recenterFrames = 0; };
  const doRecenter = (head: THREE.Object3D) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    head.getWorldPosition(p);
    head.getWorldQuaternion(q);
    const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    memoryRoot.position.set(p.x, 0, p.z);
    memoryRoot.rotation.set(0, yaw, 0);
    memoryRoot.updateMatrixWorld(true);
    room.replayReveal();
    stats.recenteredAt = [+p.x.toFixed(2), +p.z.toFixed(2), +yaw.toFixed(2)];
  };
  world.renderer.xr.addEventListener('sessionstart', () => {
    world.scene.background = null; // passthrough around the memory
    captions.drop = -0.34;
    captions.mesh.scale.setScalar(1);
    ui.setPresenting(true);
    recenter();
    const s = world.renderer.xr.getSession();
    s?.addEventListener('selectstart', (e) => { if (e.inputSource.hand) pttDown('hand', e.inputSource.handedness === 'left' ? 'left' : 'right'); });
    s?.addEventListener('selectend', (e) => { if (e.inputSource.hand) void pttUp(); });
    s?.addEventListener('visibilitychange', () => { if (s.visibilityState !== 'visible') cancelPtt('headset hidden'); });
    stats.xr = 'presenting';
  });
  world.renderer.xr.addEventListener('sessionend', () => {
    cancelPtt('session ended');
    if (pendingScale !== null) { world.renderer.xr.setFramebufferScaleFactor(pendingScale); stats.fbScale = pendingScale; pendingScale = null; }
    world.scene.background = DESKTOP_BG;
    captions.drop = DESKTOP_CAPTION.drop;
    captions.mesh.scale.setScalar(DESKTOP_CAPTION.scale);
    ui.setPresenting(false);
    memoryRoot.position.set(0, 0, 0);
    memoryRoot.rotation.set(0, 0, 0);
    requestAnimationFrame(placeDesktopCamera);
    stats.xr = 'ended';
  });

  // ---------- voice: the stub until a user gesture creates the real module (it opens the mic + AudioContext) ----------
  let spectatorTts = false; // set only when ?audio=1 and the backend grants this viewer a TTS token
  const ensureRealVoice = (why: string) => {
    if (voiceIsReal || !voiceFactory || !voiceOpts || voiceFactory.source !== 'module') return;
    if (spectator && !spectatorTts) return; // the module opens the microphone; a spectator only listens
    voice?.cancelSpeech();
    try {
      voice = voiceFactory.create(voiceOpts);
      voiceIsReal = true;
      stats.voice = { source: 'module', mode: voice.mode, createdOn: why };
      const v = voice;
      v.ready.then(() => { stats.voiceReady = true; stats.voice = { source: 'module', mode: v.mode, createdOn: why }; if (v.mode === 'live') ui.setMic('on'); sub(connected); })
        .catch((e: unknown) => { stats.voiceReady = false; report(humanError(e)); });
    } catch (e) {
      report(`Voice could not start (${String((e as Error)?.message ?? e).slice(0, 80)}). You can type instead.`);
    }
  };

  // ---------- pause ----------
  const applyPaused = (p: boolean) => {
    if (p === paused) return;
    paused = p;
    stats.paused = p;
    room.setPaused(p);
    objects.setPaused(p);
    captions.visibleTarget = p ? 0 : 1;
    companion.visibleTarget = p ? 0 : memoryOpen ? 1 : 0;
    if (p) {
      voice?.cancelSpeech(); // never speak while paused
      held.length = 0;
      captions.hide();
      replayAudio.pause();
    }
  };

  // ---------- companion speech + captions: one question per turn ----------
  // - sayBack ends with "Shall I keep it there?" (model ready): speak only the say-back; hold the reply's open
  //   question and speak it when that object flips to confirmed (drop it if the object is rejected or undone).
  // - sayBack without a question (model still generating): say-back, then the reply (the open question fills the wait).
  // - no sayBack: the reply. Never speak while paused. The caption is exactly what is spoken.
  type Held = { at: number; utteranceId: string; speaker: string; text: string; language: string | null };
  const held: Held[] = [];
  let lastHeldQueuedAt = 0;
  let speakChain: Promise<void> = Promise.resolve();
  const speakerLabel = (u: Utterance) => `${u.speaker} · ${fmtTime(u.createdAt)}`;
  const companionSay = (text: string, o: { id: string; intent: string | null; language: string | null; delayMs: number; skipIfHeldWithinMs?: number }) => {
    speakChain = speakChain.then(async () => {
      if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
      await replayDone(); // never talk over a replayed recording
      if (!voice || paused) return;
      if (o.skipIfHeldWithinMs && Date.now() - lastHeldQueuedAt < o.skipIfHeldWithinMs) return; // one question per turn
      speaking = { id: o.id, intent: o.intent };
      captions.show('Companion', text, null, { pinned: true });
      stats.lastSpoken = text;
      stats.spokenCount = Number(stats.spokenCount ?? 0) + 1;
      try { await voice.speak(text, { language: o.language }); } catch (e) { stats.lastError = `speak: ${String((e as Error)?.message ?? e).slice(0, 80)}`; }
      finally { speaking = null; captions.release(1.4); }
    });
  };
  const KEEP_IT = /Shall I keep it there\?\s*$/;
  const onDone = (u: Utterance) => {
    if (paused) return; // the companion asks nothing while paused
    if (u.translation) captions.show(speakerLabel(u), u.transcript, u.translation);
    const say = (u.sayBack ?? '').trim();
    const reply = (u.reply ?? '').trim();
    const delayMs = u.translation ? 2200 : 500;
    const base = { id: u.id, intent: u.intent, language: u.language, delayMs };
    if (say && KEEP_IT.test(say)) {
      companionSay(say, base);
      if (reply) { held.splice(0, held.length, ...held.filter((h) => h.utteranceId !== u.id)); held.push({ at: u.createdAt, utteranceId: u.id, speaker: u.speaker, text: reply, language: u.language }); }
      stats.heldQuestions = held.length;
    } else if (say) {
      companionSay(reply ? `${say} ${reply}` : say, base);
    } else if (reply) {
      // A voice "yes, that's it" also releases the confirmed object's held question; speak only one of them.
      companionSay(reply, u.intent === 'confirm_pending' ? { ...base, delayMs: 1500, skipIfHeldWithinMs: 6000 } : base);
    }
  };
  /** Object status transitions from the list: release a held question on confirm, drop it on reject/undo. */
  const lastStatus = new Map<string, { status: string; at: number | null; utteranceId: string | null }>();
  /** The object's utterance (objects.list returns utteranceId); older backends: the utterance time. */
  const heldFor = (utteranceId: string | null, at: number | null) => held.findIndex((h) => (utteranceId ? h.utteranceId === utteranceId : at !== null && h.at === at));
  let firstObjects = true;
  const onObjectTransitions = (list: ObjectRecord[]) => {
    const seen = new Set<string>();
    const initial = firstObjects;
    firstObjects = false;
    for (const rec of list) {
      seen.add(rec.id);
      const prev = lastStatus.get(rec.id);
      const at = rec.source?.at ?? null;
      if (!paused && !initial) {
        if (!prev && rec.status === 'ghost') chimes.appear();
        else if (prev?.status === 'ghost' && rec.status === 'confirmed') chimes.settle();
        stats.chimes = { ...chimes.counts, audio: chimes.state, muted: chimes.muted };
      }
      const uid = (rec as { utteranceId?: string | null }).utteranceId ?? null;
      if (prev?.status === 'ghost' && rec.status === 'confirmed') {
        const i = heldFor(uid, at);
        if (i >= 0) {
          const h = held.splice(i, 1)[0]!;
          lastHeldQueuedAt = Date.now();
          companionSay(h.text, { id: `held-${rec.id}`, intent: 'held_question', language: h.language, delayMs: 900 });
        }
      }
      lastStatus.set(rec.id, { status: rec.status, at, utteranceId: uid });
    }
    for (const [id, prev] of lastStatus) {
      if (seen.has(id)) continue;
      lastStatus.delete(id);
      const i = heldFor(prev.utteranceId, prev.at); if (i >= 0) held.splice(i, 1); // rejected or undone
    }
    stats.heldQuestions = held.length;
  };
  const onUtterances = (list: Utterance[]) => {
    if (firstUtterances) {
      firstUtterances = false;
      for (const u of list) if (u.status !== 'pending') { handled.add(u.id); shownLine.add(u.id); } // never re-speak history
    }
    for (const u of [...list].reverse()) {
      if (!shownLine.has(u.id)) {
        shownLine.add(u.id);
        if (!paused) captions.show(speakerLabel(u), u.transcript, u.translation);
        stats.lastLine = `${u.speaker}: ${u.transcript}`;
      }
      if (u.status !== 'pending' && !handled.has(u.id)) {
        handled.add(u.id); // never speak the same utterance twice
        if (u.status === 'done') onDone(u);
      }
    }
    latestPending = list[0]?.status === 'pending';
    stats.latestUtterance = list[0] ? { status: list[0].status, intent: list[0].intent, aiMode: list[0].aiMode, aiMs: list[0].aiMs } : null;
  };

  // ---------- spectator story ticker: one latest source line and one latest change ----------
  let tickerUtterances: Utterance[] = [];
  let tickerEvents: RoomEvent[] = [];
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const eventItem = (e: RoomEvent): TickerItem | null => {
    const t = fmtTime(e.at), L = e.label ? cap(e.label) : null;
    const it = (lead: string, text: string): TickerItem => ({ kind: e.kind, at: e.at, meta: '', lead, text });
    switch (e.kind) {
      case 'propose': return L ? it(L, `a glow, waiting for a yes · ${t}`) : null;
      case 'confirm': return L ? it(L, `in the room · confirmed by ${e.actor} · ${t}`) : null;
      case 'correction': return L ? it(L, `placement kept by ${e.actor} · ${t}`) : null;
      case 'reject': return L ? it(L, `not this one · ${e.actor} · ${t}`) : null;
      case 'undo': return L ? it(L, `taken back · ${t}`) : null;
      case 'pause': return it('Resting', `paused by ${e.actor} · ${t}`);
      case 'resume': return it('Back in the room', `resumed by ${e.actor} · ${t}`);
      default: return null;
    }
  };
  const lineItem = (u: Utterance): TickerItem => ({ kind: 'line', at: u.createdAt, meta: `${u.speaker} · ${fmtTime(u.createdAt)}`, text: `“${u.transcript}”`, sub: u.translation });
  const renderTicker = () => {
    if (!spectator) return;
    const lines = tickerUtterances.map(lineItem);
    // Consecutive identical changes (an undo of the confirm, then of the proposal) read as one "taken back".
    const changes = tickerEvents.map(eventItem).filter((x): x is TickerItem => !!x)
      .filter((x, i, all) => i === 0 || `${x.lead}${x.text}` !== `${all[i - 1]!.lead}${all[i - 1]!.text}`);
    // One story and one latest change keep the place visible and the speaker central.
    const shown = lines[0] ? [lines[0], ...(changes[0] ? [changes[0]] : [])] : changes.slice(0, 1);
    ui.setTicker(shown);
    stats.ticker = shown.map((p) => `${p.meta ? `${p.meta}: ` : ''}${p.lead ? `${p.lead} · ` : ''}${p.text}${p.sub ? ` / ${p.sub}` : ''}`);
  };

  // ---------- replay ----------
  const replayAudio = new Audio();
  replayAudio.preload = 'auto';
  const replayDone = () => new Promise<void>((resolve) => {
    if (replayAudio.paused || replayAudio.ended) { resolve(); return; }
    const done = () => resolve();
    replayAudio.addEventListener('ended', done, { once: true });
    replayAudio.addEventListener('pause', done, { once: true });
    setTimeout(done, 30_000);
  });
  const replay = (rec: ObjectRecord) => {
    if (paused) return;
    const gate = objects.activate(rec.id);
    if (gate !== null) stats.gateOpen = gate;
    const edit = rec.correctionSource;
    const who = edit ? edit.speaker ?? edit.actor : rec.source?.speaker ?? rec.proposedBy;
    const at = edit?.at ?? rec.source?.at ?? rec.createdAt;
    const quote = edit ? edit.transcript ?? edit.description : rec.quote || rec.where || rec.label;
    const audioUrl = edit ? edit.audioUrl : rec.source?.audioUrl;
    const spoken = edit ? !!edit.transcript : !!rec.source;
    const attribution = spoken ? `said by ${who}` : edit ? `placement by ${who}` : `added by ${who}`;
    if (!paused) captions.show(`${attribution} · ${fmtTime(at)}`, `“${quote}”`, edit ? edit.translation : rec.source?.translation ?? null, { holdS: 6 });
    stats.lastReplay = `${attribution} · ${fmtTime(at)}: “${quote}”`;
    stats.replayCount = Number(stats.replayCount ?? 0) + 1;
    const url = audioWanted ? fileUrl(audioUrl) : null;
    stats.lastReplayAudio = url ? 'playing' : audioUrl ? 'muted (spectator)' : 'no recording';
    if (url) {
      voice?.cancelSpeech();
      replayAudio.src = url;
      replayAudio.play().catch((e: unknown) => { stats.lastReplayAudio = `blocked: ${String((e as Error)?.message ?? e).slice(0, 60)}`; });
    }
  };

  // ---------- pointer + push-to-talk ----------
  const raycaster = new THREE.Raycaster();
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  let mouseNdc: THREE.Vector2 | null = null;
  const canvas = world.renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseNdc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });
  canvas.addEventListener('pointerleave', () => { mouseNdc = null; });

  const headObject = () => (world.renderer.xr.isPresenting ? (world.player.head as unknown as THREE.Object3D) : world.camera);
  const worldRay = (source: PointerSource, hand: 'left' | 'right', useMouse: boolean): boolean => {
    if (source === 'controller' || source === 'hand') {
      const space = (world.player.raySpaces as unknown as Record<string, THREE.Object3D | undefined>)[hand];
      if (space) { rayFrom(space, _o, _d); return true; }
      return false;
    }
    if (!world.renderer.xr.isPresenting && useMouse && mouseNdc) {
      raycaster.setFromCamera(mouseNdc, world.camera);
      _o.copy(raycaster.ray.origin); _d.copy(raycaster.ray.direction);
      return true;
    }
    rayFrom(headObject(), _o, _d);
    return true;
  };
  type Captured = { pointer: Pointer; o: THREE.Vector3; d: THREE.Vector3 };
  /** The release-time ray (cheap): floor-plane pointer plus the world ray for the one splat raycast. */
  const capturePointer = (source: PointerSource, hand: 'left' | 'right', useMouse: boolean): Captured => {
    if (!worldRay(source, hand, useMouse)) { worldRay('head', hand, false); source = 'head'; }
    return { pointer: toPointer(memoryRoot, _o, _d, source), o: _o.clone(), d: _d.clone() };
  };
  type Surface = { distance: number; point: THREE.Vector3; ms: number } | null;
  const castSplat = (c: Captured): Surface => {
    const surface = room.raycastOnce(c.o, c.d);
    stats.lastRaycast = surface ? { distance: +surface.distance.toFixed(2), ms: surface.ms } : { distance: null };
    return surface;
  };
  // The floor plane runs on behind the photo's walls, so check once, at release, what the ray meets first in the
  // reconstructed room (one Spark raycast per utterance, never per frame):
  //   the floor (or nothing nearer)        → the floor-plane hit
  //   a low surface (rug, floor splats)     → rest on it
  //   a table/seat/shelf (0.25–1.1 m)       → on it only when the words say "on the …"; otherwise stand on the floor
  //                                           just in front of it (a piano is never put on a table)
  //   a wall or window (above 1.1 m)        → stand on the floor just in front of it
  const ON_SURFACE = /\b(on|onto|upon|atop|on top of)\s+(the|a|an|my|our|his|her|their)?\s*(table|desk|shelf|mantel|mantelpiece|sideboard|dresser|counter|bench|sofa|couch|chair|stool|windowsill|sill|cabinet|piano|radiator|bookcase|chest|stand|tray)\b/i;
  const _sp = new THREE.Vector3(), _dl = new THREE.Vector3(), _po = new THREE.Vector3(), _pd = new THREE.Vector3(), _fp = new THREE.Vector3();
  // The photo's floor is not perfectly flat at y = 0 (single-image depth drifts with distance), so a standing object
  // takes its base height from what the photo's own camera sees at that spot: one more raycast from the photo camera
  // (memory-root origin at eye height) toward (x, 0, z). Splats face that camera, so this hits them reliably; a hit
  // that lands far from the spot (something in between) falls back to y = 0. Kept within -0.15 … 0.5 m.
  const floorAt = (x: number, z: number): number => {
    _po.set(0, room.eyeHeight, 0);
    _pd.set(x, 0, z).sub(_po).normalize();
    memoryRoot.localToWorld(_po);
    _pd.transformDirection(memoryRoot.matrixWorld);
    const hit = room.raycastOnce(_po, _pd, 20);
    let y: number | null = null;
    if (hit) {
      _fp.copy(hit.point);
      memoryRoot.worldToLocal(_fp);
      const dh = Math.hypot(_fp.x - x, _fp.z - z);
      // At the spot: its height. Short of it on a low surface: the floor rises with distance in a single-photo
      // reconstruction, so the visible floor just before the spot is the best (slightly low) estimate.
      if (dh < 0.6 || (dh < 3 && _fp.y < 0.5)) y = _fp.y;
    }
    stats.lastFloorProbe = { x: +x.toFixed(2), z: +z.toFixed(2), y: y === null ? null : +y.toFixed(3) };
    return y !== null && y >= -0.15 && y <= 0.5 ? Math.round(y * 1000) / 1000 : NaN;
  };
  const floorOr0 = (x: number, z: number) => { const y = floorAt(x, z); return Number.isNaN(y) ? 0 : y; };
  /** In front of a surface or wall: step back toward the viewer until the photo shows floor there (≤ 3 probes). */
  const standInFront = (back: (m: number) => [number, number, number], first: number): [number, number, number] => {
    for (const m of [first, first + 0.4, first + 0.8]) {
      const p = back(m);
      const y = floorAt(p[0], p[2]);
      if (!Number.isNaN(y)) return [p[0], y, p[2]];
    }
    return back(first);
  };
  const placeFrom = ({ pointer }: Captured, surface: Surface, words: string): Pointer => {
    if (!surface) {
      if (pointer.hit) pointer = { ...pointer, hit: [pointer.hit[0], floorOr0(pointer.hit[0], pointer.hit[2]), pointer.hit[2]] };
      stats.lastPlacement = pointer.hit ? 'floor' : 'none (backend default)';
      return pointer;
    }
    const [ox, oy, oz] = pointer.origin;
    const floorDist = pointer.hit ? Math.hypot(pointer.hit[0] - ox, pointer.hit[1] - oy, pointer.hit[2] - oz) : Infinity;
    if (pointer.hit && floorDist <= surface.distance + 0.15) { // the floor comes first
      stats.lastPlacement = 'floor';
      return { ...pointer, hit: [pointer.hit[0], floorOr0(pointer.hit[0], pointer.hit[2]), pointer.hit[2]] };
    }
    _sp.copy(surface.point);
    memoryRoot.worldToLocal(_sp);
    _dl.set(...pointer.direction);
    const h = Math.hypot(_dl.x, _dl.z) || 1;
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    const sx = _sp.x, sz = _sp.z, dx = _dl.x / h, dz = _dl.z / h;
    const back = (m: number): [number, number, number] => [sx - dx * m, 0, sz - dz * m];
    let hit: [number, number, number];
    if (_sp.y <= 0.25) { hit = [_sp.x - _dl.x * 0.1, Math.max(0, _sp.y), _sp.z - _dl.z * 0.1]; stats.lastPlacement = 'floor (reconstructed)'; }
    else if (_sp.y <= 1.1) {
      // A table/seat/shelf: send both spots. The backend picks the surface when the words MEAN "on" (Claude's
      // relation, any language) or the object is small (radio, teapot…); furniture stands on the floor in front.
      const surfaceHit: [number, number, number] = [r3(_sp.x - _dl.x * 0.1), r3(_sp.y), r3(_sp.z - _dl.z * 0.1)];
      hit = standInFront(back, 0.4);
      stats.lastPlacement = ON_SURFACE.test(words) ? 'surface offered (words say on)' : 'floor in front of a surface (surface offered)';
      return { ...pointer, hit: [r3(hit[0]), r3(hit[1]), r3(hit[2])], surfaceHit };
    }
    else { hit = standInFront(back, 0.45); stats.lastPlacement = 'floor in front of a wall'; }
    return { ...pointer, hit: [r3(hit[0]), r3(hit[1]), r3(hit[2])] };
  };
  const pickAlong = (source: PointerSource, hand: 'left' | 'right'): ObjectRecord | null => {
    if (!worldRay(source, hand, true)) return null;
    raycaster.set(_o, _d);
    return objects.pick(raycaster);
  };

  let ptt: { source: PointerSource; hand: 'left' | 'right'; t0: number; pick: ObjectRecord | null; started: Promise<boolean>; useMouse: boolean } | null = null;
  /** A press whose release we will never see (session ended, headset hidden, controller lost): close the turn, send nothing. */
  const cancelPtt = (why: string) => {
    const p = ptt;
    if (!p) return;
    ptt = null;
    ui.setTalkHeld(false);
    stats.ptt = `cancelled: ${why}`;
    void p.started.then(() => voice?.stop()).catch(() => undefined);
  };
  const pttDown = (source: PointerSource, hand: 'left' | 'right' = 'right', useMouse = false) => {
    if (ptt || !session) return;
    ensureRealVoice('push-to-talk');
    if (!voice) return;
    if (paused) { ui.setStatus('The memory is paused. Ask the family to resume it on the phone, or press B.'); return; }
    try { replayAudio?.pause(); } catch { /* nothing playing */ } // a playing clip must not leak into the new turn
    const v = voice;
    const pick = source === 'head' ? null : pickAlong(source, hand);
    ptt = { source, hand, t0: performance.now(), pick, useMouse,
      started: v.start().then(() => true, (e: unknown) => { report(humanError(e)); return false; }) };
    ui.setTalkHeld(true);
    stats.ptt = 'held';
  };
  const pttUp = async () => {
    const p = ptt;
    if (!p || !voice || !session || !client) return;
    ptt = null;
    ui.setTalkHeld(false);
    stats.ptt = 'released';
    const heldMs = performance.now() - p.t0;
    const captured = capturePointer(p.source, p.hand, p.useMouse); // the ray at the moment of release
    const ok = await p.started;
    if (heldMs < 350 && p.pick) { // a trigger click on a settled object: replay it instead of talking
      if (ok) void voice.stop().catch(() => undefined);
      replay(p.pick);
      return;
    }
    if (!ok) return;
    try {
      const stopping = voice.stop(); // finalize the transcript first; raycast while the words come back
      const surface = castSplat(captured);
      const res = await stopping;
      let transcript = res.transcript.trim();
      let typedFallback = false;
      if (!transcript && voice.mode === 'mock' && ui.typedInput.value.trim()) { transcript = ui.typedInput.value.trim(); typedFallback = true; }
      const pointer = placeFrom(captured, surface, transcript);
      stats.lastPtt = { heldMs: Math.round(heldMs), durationMs: res.durationMs, chars: transcript.length, pointer };
      if (!transcript) { ui.setStatus('Nothing was heard. Hold, speak, then let go.'); return; }
      await client.mutation(api.utterances.add, {
        code: session.code, token: session.token, transcript, source: voice.mode === 'live' && !typedFallback ? 'stt' : 'typed', pointer,
        durationMs: res.durationMs, ...(res.audioFileId ? { audioFileId: res.audioFileId as Id<'_storage'> } : {}), commandId: newCommandId(),
      });
      if (voice.mode === 'mock' || typedFallback) ui.typedInput.value = '';
    } catch (e) { report(humanError(e)); }
  };

  const sendTyped = async (text: string) => {
    const transcript = text.trim();
    if (!transcript || !client || !session) return;
    if (paused) { ui.setStatus('The memory is paused.'); return; }
    const captured = capturePointer('head', 'right', true);
    const pointer = placeFrom(captured, castSplat(captured), transcript);
    stats.lastTyped = { at: Math.round(performance.now()), pointer };
    try {
      await client.mutation(api.utterances.add, { code: session.code, token: session.token, transcript, source: 'typed', pointer, durationMs: 0, commandId: newCommandId() });
    } catch (e) { report(humanError(e)); }
  };

  const setPausedRemote = async (p: boolean) => {
    if (!client || !session) return;
    try { await client.mutation(api.rooms.setPaused, { code: session.code, token: session.token, paused: p, commandId: newCommandId() }); }
    catch (e) { report(humanError(e)); }
  };
  const confirmNearestGhost = async () => {
    if (!client || !session || paused) return; // while resting the ghosts are hidden: never confirm what can't be seen
    if (pendingCorrectionId) {
      try { await client.mutation(api.corrections.confirm, { ...session, correctionId: pendingCorrectionId, commandId: newCommandId() }); }
      catch (e) { report(humanError(e)); }
      return;
    }
    const list = objects.ghostsNearest(memoryRoot, headObject());
    const target = list[0];
    if (!target) return;
    try { await client.mutation(api.objects.confirm, { code: session.code, token: session.token, objectId: target as Id<'objects'>, commandId: newCommandId() }); }
    catch (e) { if (errorCode(e) !== 'STALE') report(humanError(e)); }
  };

  // Desktop input: hold Space or the round button to talk; click an object to replay; P pauses/resumes.
  const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
  window.addEventListener('keydown', (e) => {
    if (spectator || typing() || e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); pttDown('head', 'right', true); }
    else if (e.key === 'p' || e.key === 'P') void setPausedRemote(!paused);
  });
  window.addEventListener('keyup', (e) => { if (!spectator && e.code === 'Space' && ptt) { e.preventDefault(); void pttUp(); } });
  ui.talk.addEventListener('pointerdown', (e) => { e.preventDefault(); ui.talk.setPointerCapture(e.pointerId); pttDown('head', 'right', false); });
  const talkUp = () => { if (ptt) void pttUp(); };
  ui.talk.addEventListener('pointerup', talkUp);
  ui.talk.addEventListener('pointercancel', talkUp);
  ui.typedForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = ui.typedInput.value;
    ui.typedInput.value = '';
    void sendTyped(v);
  });
  setStubTranscriptSource(() => ui.typedInput.value);
  canvas.addEventListener('click', (e) => {
    if (world.renderer.xr.isPresenting) return;
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), world.camera);
    const rec = objects.pick(raycaster);
    if (rec) replay(rec);
  });

  // XR controllers (buttons read by name, never raw index: V17): right trigger = push-to-talk (a short click on a
  // settled object replays it), A = confirm the ghost in front of you, B = pause / resume.
  const pollXr = () => {
    const right = world.input.xr.gamepads.right;
    if (!right) { if (ptt?.source === 'controller') cancelPtt('controller lost'); return; }
    if (right.getButtonDown('xr-standard-trigger')) pttDown('controller', 'right');
    if (right.getButtonUp('xr-standard-trigger') && ptt?.source === 'controller') void pttUp();
    if (right.getButtonDown('a-button')) void confirmNearestGhost();
    if (right.getButtonDown('b-button')) void setPausedRemote(!paused);
  };

  // ---------- 2D page buttons ----------
  ui.mic.addEventListener('click', async () => {
    ensureRealVoice('enable-microphone');
    ui.setMic('asking');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      s.getTracks().forEach((t) => t.stop()); // the voice module opens its own stream; the permission is what we need
      ui.setMic('on');
      stats.mic = 'granted';
    } catch (e) {
      ui.setMic('blocked');
      stats.mic = `blocked: ${String((e as Error)?.name ?? e)}`;
      report('The microphone is blocked. Allow it for this page in the browser settings, then try again.');
    }
  });
  // The first gesture anywhere on the page starts the voice (mic + pre-opened STT socket) so the first turn is warm.
  const firstGesture = () => { if (spectator) return; chimes.unlock(); ensureRealVoice('first-gesture'); window.removeEventListener('pointerdown', firstGesture, true); window.removeEventListener('keydown', firstGesture, true); };
  window.addEventListener('pointerdown', firstGesture, true);
  window.addEventListener('keydown', firstGesture, true);
  navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((p) => { if (p.state === 'granted') { ui.setMic('on'); stats.mic = 'granted'; } }).catch(() => undefined);
  ui.enter.addEventListener('click', () => {
    chimes.unlock();
    ensureRealVoice('enter');
    try { world.launchXR(); stats.enterClicked = true; }
    catch (e) { report(`This browser can't open the memory in the headset (${String((e as Error)?.message ?? e).slice(0, 60)}).`); }
  });
  (async () => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
    // A read-only embedded viewer does not request XR capabilities from its sandboxed frame.
    const ok = !spectator && xr ? await xr.isSessionSupported('immersive-ar').catch(() => false) : false;
    stats.arSupported = ok;
    if (!ok) ui.setEnterReady(false, 'Open this page on the Quest to enter');
  })();

  // ---------- debug HUD (?hud=1): head-locked fps / settings readout; the product never shows it ----------
  const hudOn = params.get('hud') === '1';
  let drawHud = () => undefined as void;
  if (hudOn) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const c2 = cv.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cv);
    const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.08), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
    hud.renderOrder = 2001;
    hud.position.set(-0.12, -0.16, -0.6);
    (world.player.head as unknown as THREE.Object3D).add(hud);
    drawHud = () => {
      c2.clearRect(0, 0, 512, 128);
      c2.fillStyle = 'rgba(20,16,12,0.72)'; c2.fillRect(0, 0, 512, 128);
      c2.fillStyle = '#f6e3c2'; c2.font = '28px system-ui, sans-serif';
      c2.fillText(`fps ${stats.fps ?? '-'}  objects ${objects.count}  ${paused ? 'PAUSED' : ''}`, 16, 46);
      c2.font = '22px system-ui, sans-serif';
      c2.fillText(`${liteRoom ? 'lite room · ' : ''}mv ${multiview ? 'ON' : 'off'} scale ${stats.fbScale ?? fbScale} voice ${voice?.mode ?? '-'}/${voiceState}`, 16, 96);
      tex.needsUpdate = true;
    };
  }

  // ---------- per-frame ----------
  const clock = new THREE.Clock();
  const tmpV2 = new THREE.Vector2();
  let refreshSub: (() => void) | null = null;
  let time = 0, frames = 0, lastFps = performance.now(), dustFade = 0;
  const tickInner = () => {
    const dt = Math.min(0.05, clock.getDelta());
    time += dt;
    const presenting = world.renderer.xr.isPresenting;
    const viewer = headObject();
    const layer = presenting ? (world.renderer.xr.getBaseLayer() as XRWebGLLayer | null) : null;
    VIEWPORT_H.value = layer?.framebufferHeight ?? world.renderer.getDrawingBufferSize(tmpV2).y;

    if (presenting && recenterPending) {
      recenterFrames++;
      const h = world.player.head as unknown as THREE.Object3D;
      h.updateMatrixWorld(true);
      if (h.matrixWorld.elements[13]! > 0.3 || recenterFrames > 30) { doRecenter(h); recenterPending = false; }
    }
    if (presenting) pollXr();
    else if (driftOn && room.ready && roomView?.room.layout !== 'courtyard' && !params.get('cam')) {
      // A very slow, calm drift so people see the memory is 3D: ±0.15 m sideways, ±2° yaw back toward the room's
      // middle, one sine over 40 s (0.025 Hz).
      const ph = (time / 40) * Math.PI * 2;
      world.camera.position.set(0.15 * Math.sin(ph), room.eyeHeight, 0);
      world.camera.rotation.set(0, THREE.MathUtils.degToRad(2) * Math.sin(ph), 0);
    }

    room.update(dt);
    keepsakes.update(paused);
    objects.update(dt, time, viewer);
    motes.uniforms.uTime.value = time;
    dust.uniforms.uTime.value = time;
    dustFade += ((paused || !room.ready ? 0 : 1) - dustFade) * Math.min(1, dt * 1.2);
    dust.uniforms.uFade.value = dustFade;
    motes.uniforms.uFade.value = paused ? Math.max(0, motes.uniforms.uFade.value - dt / 1.5) : 1;

    let cs: CompanionState = 'idle';
    if (voiceState === 'speaking' || speaking) cs = 'speaking';
    else if (ptt) cs = 'listening';
    else if (latestPending) cs = 'thinking';
    companion.state = cs;
    companion.level = voice ? voice.level() : 0;
    companion.update(dt, time, viewer);
    captions.update(dt, viewer);

    frames++;
    const now = performance.now();
    if (now - lastFps > 2000) { stats.fps = Math.round((frames * 1000) / (now - lastFps)); frames = 0; lastFps = now; drawHud(); refreshSub?.(); }
    stats.objects = objects.describe();
    stats.modelSwaps = objects.swaps;
    stats.companion = cs;
    stats.caption = captions.isShowing && captions.current ? `${captions.current.speaker}: ${captions.current.text}${captions.current.translation ? ` / ${captions.current.translation}` : ''}` : null;
    stats.xrPresenting = presenting;
  };
  let tickErrors = 0;
  const tick = () => {
    try {
      if (fallback) fallback.visible = !paused && !room.ready;
      tickInner();
    }
    catch (e) { tickErrors++; stats.tickError = `${tickErrors}: ${String((e as Error)?.message ?? e).slice(0, 160)}`; }
  };
  const orig = world.scene.onBeforeRender;
  world.scene.onBeforeRender = (...args) => { tick(); orig.apply(world.scene, args); };

  room.onReady = (ms, revealed) => {
    stats.sceneReady = true;
    stats.sceneSource = 'generated-or-prepared-splat';
    stats.splatLoaded = true;
    stats.splatLoadMs = ms;
    stats.tSplatReady = Math.round(performance.now());
    ui.setLoading(false);
    placeDesktopCamera();
    if (!memoryOpen) { memoryOpen = true; if (!paused) companion.visibleTarget = 1; }
    if (world.renderer.xr.isPresenting && revealed) recenter(); // a lite/full switch keeps the room where it is
  };

  // ---------- join ----------
  stats.phase = 'joining';
  let code = roomCodeFromUrl();
  let joinError: string | undefined;
  for (;;) {
    if (!code) {
      code = await ui.askForCode(joinError);
      const u = new URL(location.href);
      u.searchParams.set('room', code);
      history.replaceState(null, '', u.toString());
    }
    try {
      client ??= makeClient();
      session = await joinRoom(client, code, spectator ? 'viewer' : 'storyteller');
      break;
    } catch (e) {
      joinError = humanError(e);
      stats.lastError = joinError;
      if (errorCode(e) === 'ROOM_NOT_FOUND') { code = null; continue; }
      ui.error(joinError, 0);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  const sess = session;
  const cl = client!;
  try { localStorage.setItem('mg.lastCode', sess.code); } catch { /* no storage */ }
  stats.phase = 'joined';
  stats.code = sess.code;
  stats.tJoined = Math.round(performance.now());
  ui.clearError();
  ui.showRoom('Opening the memory…');
  ui.setLoading(true, 'The memory is forming…');
  ui.setSub(`Room <b>${sess.code}</b> · connecting…`);

  // ---------- voice ----------
  voiceOpts = {
    client: cl, api, code: sess.code, token: sess.token,
    onState: (st) => { voiceState = st; stats.voiceState = st; },
    onError: (msg) => report(msg),
  };
  voiceFactory = await resolveVoiceFactory();
  voice = createStubVoice(voiceOpts);
  stats.voice = { source: voiceFactory.source === 'module' ? 'stub-until-gesture' : 'stub', mode: voice.mode, note: voiceFactory.note };
  stats.voiceReady = true;

  // ---------- subscriptions ----------
  const subError = (what: string) => (e: Error) => {
    stats.lastError = `${what}: ${e.message.slice(0, 120)}`;
    ui.error(humanError(e), 0);
  };
  const sub = (connected: boolean) => {
    if (!roomView) return;
    const s = roomView.splat;
    const splatText = !s ? 'illustrative courtyard · no photo reconstruction' : s.status === 'ready' ? (liteRoom ? `lite room (${((s.liteNumSplats ?? 250_000) / 1000).toFixed(0)}k)` : `${s.source === 'sharp' ? 'SHARP' : s.source} splat, ${(s.numSplats / 1000).toFixed(0)}k`) : `memory ${s.status}…`;
    const voiceText = voice?.mode === 'live' ? 'live' : voiceFactory?.source === 'module' && !voiceIsReal ? 'starts with the microphone' : 'typed (mock)';
    ui.setSub(`Room <b>${sess.code}</b> · ${connected ? 'connected' : 'reconnecting…'} · ${splatText} · voice: ${voiceText}${paused ? ' · <b>paused</b>' : ''}`);
  };
  let connected = true;
  refreshSub = () => sub(connected); // the voice mode can change after ready (e.g. the STT socket opens)
  cl.subscribeToConnectionState((c) => {
    const now = c.isWebSocketConnected;
    if (now !== connected) { connected = now; sub(connected); if (!now) ui.setStatus('Reconnecting to the memory server…'); else ui.setStatus(''); }
  });
  cl.onUpdate(api.rooms.get, { code: sess.code, token: sess.token }, (r) => {
    roomView = r;
    stats.roomTitle = r.room.title;
    stats.flags = r.flags;
    stats.tRoom ??= Math.round(performance.now());
    ui.showRoom(r.room.title);
    ui.setSceneContext(r.room.title, r.splat?.status === 'ready', r.room.demo, r.room.paused);
    if (r.splat?.status === 'ready' && r.splat.url) {
      // splat.lite (phone admin): the 250k SPZ of the same memory, paired with XR framebuffer scale 0.5 (CLAUDE.md).
      const lite = !!(r.flags['splat.lite'] && r.splat.liteUrl);
      const url = fileUrl(lite ? r.splat.liteUrl : r.splat.url)!;
      const sameMemory = loadedSplatId === r.splat.id;
      loadedSplatId = r.splat.id;
      liteRoom = lite;
      stats.splatLite = lite;
      stats.splatUrl = url.replace(/[?#].*$/, '');
      room.load({ url, floorY: r.splat.floorY, scale: r.splat.scale, source: r.splat.source, numSplats: lite ? r.splat.liteNumSplats ?? 250_000 : r.splat.numSplats, reveal: !sameMemory });
      const wantScale = lite ? 0.5 : fbScale;
      if (!world.renderer.xr.isPresenting) { world.renderer.xr.setFramebufferScaleFactor(wantScale); stats.fbScale = wantScale; }
      else pendingScale = wantScale; // applies at the next Enter
      stats.splatSource = r.splat.source;
      stats.eyeHeight = +room.eyeHeight.toFixed(3);
      if (!room.ready) placeDesktopCamera();
    } else {
      if (loadedSplatId) {
        room.clear();
        loadedSplatId = null;
        liteRoom = false;
        stats.splatLoaded = false;
        stats.splatSource = null;
        placeDesktopCamera();
      }
      stats.sceneSource = 'illustrative-procedural';
      stats.sceneReady = !!fallback;
      ui.setLoading(!fallback, r.splat ? 'The memory is still being made…' : 'Opening the illustrative courtyard…');
      if (fallback && !memoryOpen) {
        placeDesktopCamera();
        memoryOpen = true;
        if (!paused) companion.visibleTarget = 1;
      }
    }
    applyPaused(r.room.paused);
    if (lastOpenedAt !== undefined && r.room.openedAt !== lastOpenedAt && r.room.openedAt) {
      // The phone tapped "Show": open the memory again (recenter in XR, replay the reveal).
      if (world.renderer.xr.isPresenting) recenter(); else room.replayReveal();
    }
    lastOpenedAt = r.room.openedAt;
    sub(connected);
  }, subError('room'));
  cl.onUpdate(api.objects.list, { code: sess.code, token: sess.token }, (list) => {
    pendingCorrectionId = list.find(o => o.pendingCorrection)?.pendingCorrection?.id ?? null;
    stats.pendingCorrection = pendingCorrectionId;
    stats.objectRecords = list.map((o) => `${o.label}:${o.status}:${o.model}:${o.glbUrl ? o.modelSource : 'none'}`).join(',');
    onObjectTransitions(list);
    objects.sync(list);
  }, subError('objects'));
  cl.onUpdate(api.utterances.recent, { code: sess.code, token: sess.token, limit: 10 }, (list) => { onUtterances(list); tickerUtterances = list; renderTicker(); }, subError('utterances'));
  if (spectator) {
    cl.onUpdate(api.objects.events, { code: sess.code, token: sess.token }, (list) => { tickerEvents = list; renderTicker(); }, subError('events'));
    if (audioWanted) {
      ui.showSoundButton(() => {
        chimes.unlock();
        // Speech for spectators only if the backend grants this viewer a TTS token (viewers usually can't mint).
        cl.action(api.voice.mintToken, { code: sess.code, token: sess.token })
          .then((m) => { if (m.token && m.ttsLive) { spectatorTts = true; ensureRealVoice('spectator-audio'); } stats.spectatorTts = spectatorTts; })
          .catch(() => { stats.spectatorTts = false; });
      });
    }
  }

  // ---------- heartbeat (the phone shows the headset as present) ----------
  const beat = () => cl.mutation(api.rooms.heartbeat, { code: sess.code, token: sess.token })
    .then(() => { stats.heartbeatAt = Date.now(); }).catch((e: unknown) => { stats.lastError = `heartbeat: ${humanError(e)}`; });
  if (!spectator) { void beat(); setInterval(beat, 10_000); }

  // ---------- test hooks (Playwright / emulator scripts) ----------
  Object.assign(mg, {
    placements: () => objects.snapshot(),
    keepsakes: () => keepsakes.snapshot(),
    objectScreenPoint: (id: string) => {
      const point = objects.screenPoint(id, world.camera);
      if (!point) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (point[0]! + 1) * rect.width / 2, y: rect.top + (1 - point[1]!) * rect.height / 2, depth: point[2] };
    },
    captionFrame: () => {
      const bounds = new THREE.Box3().setFromObject(captions.mesh);
      const corners = [];
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        corners.push(new THREE.Vector3(x, y, z).project(world.camera));
      }
      return { visible: captions.mesh.visible, inside: corners.every(p => Math.abs(p.x) < .99 && Math.abs(p.y) < .99 && Math.abs(p.z) < 1),
        x: corners.map(p => p.x), y: corners.map(p => p.y) };
    },
    say: (text: string) => sendTyped(text),
    pttDown: () => pttDown('head', 'right', false),
    enableVoice: () => ensureRealVoice('test-hook'),
    useMockVoice: () => { if (!voiceIsReal && voiceFactory) voiceFactory = { create: createStubVoice, source: 'stub', note: 'mock voice forced by a test hook' }; },
    pttUp: () => pttUp(),
    pickAt: (nx: number, ny: number) => {
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), world.camera);
      const rec = objects.pick(raycaster);
      if (rec) replay(rec);
      return rec?.label ?? null;
    },
    pause: (p: boolean) => setPausedRemote(p),
    recenter,
    confirmNearest: () => confirmNearestGhost(),
    floorProbe: (x: number, z: number) => { floorAt(x, z); return stats.lastFloorProbe; },
  });
  stats.phase = 'ready';
}
