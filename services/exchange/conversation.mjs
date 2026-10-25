// The companion's conversation with everyone in a visit (a grandparent in the headset and a grandchild on the laptop,
// say), kept in SpacetimeDB. Not a second companion: the same one (guide:respond, its voice, its figure), told that
// several people are here. Every device listens. This module hears each utterance, decides whose words
// they were (the same words picked up by both microphones count once, for the louder: shared/src/crosstalk.ts), waits
// for a lull while the two talk with each other (shared/src/lull.ts), then asks the companion's brain once about
// everything just said and sends the answer to every device in the room, each of which speaks it. It is the only
// writer of the conversation and the only caller of the brain for a live visit, so both people are always answered
// from the same, whole conversation. The brain is called as the person who spoke last (their own room token), so the
// budget, live-service and membership checks are exactly those of any other companion turn.
import { makeFunctionReference } from 'convex/server';
import { judge } from '../../packages/shared/src/crosstalk.ts';
import { addressesCompanion, shouldSpeak, untilLull } from '../../packages/shared/src/lull.ts';
import { asksToEnter, genericName as generic, guideTogether, resolveReply } from '../../packages/shared/src/guide.ts';
import { LANGS, LANGUAGE_SETTINGS } from '../../packages/shared/src/language.ts';

const respondRef = makeFunctionReference('guide:respond');
const summarizeRef = makeFunctionReference('guide:summarize');
const DEVICES = ['headset', 'phone', 'desktop'];
const STAGES = ['portal', 'greeting', 'gathering', 'entering', 'forming', 'memory', 'leaving', 'album'];
/** The companion speaks at the gate and inside the memory; never over the walk in or out. */
const SPEAKING_STAGES = new Set(['greeting', 'gathering', 'forming', 'memory']);
const KEEP_HEARD_MS = 20_000;
const OPEN_TURN_MS = 45_000; // a turn heard starting but never finished stops counting after this
const WAIT_FOR_OTHER_MS = 1500;
const BRAIN_MS = 7000;
const SUMMARY_EVERY = 12;

const bad = () => new Error('Invalid request.');
const str = (v, max, empty = false) => { if (typeof v !== 'string' || v.length > max || (!empty && !v.trim())) throw bad(); return v; };
const turnIdOf = (v) => { if (typeof v !== 'string' || !/^[a-f0-9-]{36}$/.test(v)) throw new Error('A valid turn is required.'); return v; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p).catch(() => null), sleep(ms).then(() => null)]);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** What the brain is told (pure, for tests): the shared conversation by name and the eyes each sees through. */
export function buildInput({ turns, batch, people, summary, flow, labelOf }) {
  // One person on their own (nobody has joined, or they left): an ordinary turn, as in a visit alone.
  const two = people.length > 1;
  return {
    phase: flow?.stage === 'memory' || flow?.stage === 'forming' ? 'memory' : 'gathering',
    transcript: batch.map(b => b.text).join(' … ').slice(0, 600),
    history: turns.slice(-14).map(t => (t.who === 'companion' || !two ? { who: t.who, text: t.text } : { who: 'person', text: t.text, name: t.speakerName, perspective: labelOf(t.perspectiveId) })),
    media: flow?.media ?? null, mediaCaption: flow?.mediaCaption ?? null, place: flow?.place ?? null,
    invitedToEnter: !!flow?.invitedToEnter, turnsInPhase: flow?.turnsInPhase ?? 0,
    ...(two ? { together: { people: people.map(({ name, perspective, role, child, stories }) => ({ name, perspective, role, child, stories })), summary: summary ?? null } } : {}),
  };
}

/** Without the brain: a short note of who talked about what, so the conversation still carries over. */
export function offlineSummary(turns) {
  const said = turns.filter(t => t.who === 'person');
  const names = [...new Set(said.map(t => t.name).filter(n => n && !generic(n)))];
  return `${names.length ? names.join(' and ') : 'They'} talked about: ${said.slice(-3).map(t => t.text.slice(0, 80)).join('; ')}`.slice(0, 600);
}

export function createConversation({ db, clients, send, convex }) {
  const rooms = new Map();
  const roomOf = (roomId) => {
    let r = rooms.get(roomId);
    if (!r) {
      r = { open: new Map(), heard: [], pending: [], waiters: new Map(), levels: new Map(), lastHeardAt: 0, lastSpokeAt: 0, addressed: false,
        timer: null, speaking: false, flow: null, auth: null, sinceSummary: 0, welcomed: new Set() };
      rooms.set(roomId, r);
    }
    return r;
  };
  // In the room: authorized lately (every device is re-checked every 5 s, and on every action it takes).
  const fresh = (c, roomId) => c.context?.roomId === roomId && Date.now() - c.authorizedAt < 30_000;
  const inRoom = (roomId) => [...clients].filter(c => fresh(c, roomId));
  const broadcast = (roomId, data, except = null) => { for (const c of inRoom(roomId)) if (c !== except) send(c, data); };
  const rows = (table, roomId) => [...db.db[table].iter()].filter(r => r.roomId === roomId);
  const labelOf = (perspectiveId) => (perspectiveId ? db.db.perspective.id.find(perspectiveId)?.label ?? null : null);
  /** The eyes someone speaks from: the perspective they claimed, else the one they're looking through now. */
  function perspectiveOf(roomId, memberId) {
    const all = rows('perspective', roomId);
    const pose = db.db.pose.memberId.find(memberId);
    return all.find(p => p.claimedBy === memberId) ?? all.find(p => p.id === pose?.perspectiveId) ?? null;
  }
  function peopleOf(roomId) {
    const seen = new Map();
    for (const c of inRoom(roomId)) {
      const x = c.context;
      if (seen.has(x.memberId)) continue;
      const p = perspectiveOf(roomId, x.memberId);
      const stories = rows('perspectiveStory', roomId).filter(s => s.speakerId === x.memberId).sort((a, b) => a.createdAt - b.createdAt).slice(-3).map(s => s.text);
      seen.set(x.memberId, { memberId: x.memberId, name: x.displayName, perspective: p?.label ?? null, role: x.isOwner ? 'host' : 'guest', child: p?.key === 'child', stories });
    }
    return [...seen.values()];
  }
  const lullState = (r, now) => ({ open: [...r.open.values()].filter(o => now - o.at < OPEN_TURN_MS).length, lastHeardAt: r.lastHeardAt, lastSpokeAt: r.lastSpokeAt, pending: r.pending.length, addressed: r.addressed });

  function schedule(roomId) {
    const r = roomOf(roomId);
    clearTimeout(r.timer); r.timer = null;
    if (r.flow && !SPEAKING_STAGES.has(r.flow.stage)) return;
    const wait = untilLull(lullState(r, Date.now()), Date.now());
    if (wait === null) return;
    r.timer = setTimeout(() => {
      r.timer = null;
      if (shouldSpeak(lullState(r, Date.now()), Date.now())) void speak(roomId); else schedule(roomId);
    }, wait + 20);
  }

  async function addTurn(row) {
    await db.reducers.addConversationTurn({ memberId: '', speakerName: 'Companion', perspectiveId: '', intent: '', ...row }).catch(() => undefined);
  }

  /** The lull came: one answer to everything said since the companion last spoke, to every device in the room. */
  async function speak(roomId) {
    const r = roomOf(roomId);
    if (r.speaking || !r.auth || r.pending.length === 0) return;
    r.speaking = true;
    const batch = r.pending.splice(0); r.addressed = false;
    try {
      const people = peopleOf(roomId);
      const input = buildInput({ turns: rows('conversationTurn', roomId).sort((a, b) => a.createdAt - b.createdAt), batch, people,
        summary: db.db.conversationSummary.roomId.find(roomId)?.summary, flow: r.flow, labelOf });
      const last = batch[batch.length - 1];
      Object.assign(input, { language: last.language, setting: last.setting });
      const online = await withTimeout(convex.action(respondRef, { ...r.auth, input }), BRAIN_MS);
      if (online?.listen) return; // they're talking with each other: let them
      // One turn's language, as for one person (shared/src/guide.ts resolveReply); offline, the last speaker by name.
      const turn = resolveReply(input, online);
      const reply = online ? turn.reply : guideTogether({ ...input, language: turn.language });
      if (!reply.reply?.trim()) return;
      if (r.flow && !SPEAKING_STAGES.has(r.flow.stage)) return; // the visit moved on (stepped through, left) meanwhile
      const text = reply.reply;
      const named = (reply.detailFor ?? '').trim().toLowerCase();
      const detailFor = reply.intent === 'add_detail' ? people.find(p => named && p.name.toLowerCase() === named)?.memberId ?? last.memberId : null;
      const id = `${roomId}:${crypto.randomUUID()}:c`;
      await addTurn({ id, roomId, who: 'companion', text, intent: reply.intent });
      r.lastSpokeAt = Date.now();
      broadcast(roomId, { type: 'companion', id, text, intent: reply.intent, place: reply.place ?? null, invites: asksToEnter(text), detailFor, intentFor: last.memberId,
        language: turn.language, speakIn: online ? turn.speakIn : turn.language, english: online?.english ?? null,
        heard: batch.map(b => ({ memberId: b.memberId, name: b.name, text: b.text })) });
      r.sinceSummary += batch.length + 1;
      if (r.sinceSummary >= SUMMARY_EVERY) void summarize(roomId);
    } finally {
      r.speaking = false;
      if (r.pending.length) schedule(roomId);
    }
  }

  async function summarize(roomId) {
    const r = roomOf(roomId);
    r.sinceSummary = 0;
    const turns = rows('conversationTurn', roomId).sort((a, b) => a.createdAt - b.createdAt).slice(-24)
      .map(t => (t.who === 'person' ? { who: 'person', text: t.text, name: t.speakerName } : { who: 'companion', text: t.text }));
    if (!turns.length) return;
    const prior = db.db.conversationSummary.roomId.find(roomId);
    const names = [...new Set(turns.map(t => t.name).filter(Boolean))].join(' and ');
    const online = r.auth ? await withTimeout(convex.action(summarizeRef, { ...r.auth, label: `Together: ${names || 'family'}`, ...(prior?.summary ? { previous: prior.summary } : {}), turns }), 15_000) : null;
    await db.reducers.setConversationSummary({ roomId, summary: (online ?? offlineSummary(turns)).slice(0, 1200), turnCount: Math.min(0xffffffff, (prior?.turnCount ?? 0) + turns.length) }).catch(() => undefined);
  }

  return {
    /** Fast lane, at voice onset (and when a turn ends with nothing said): "someone is talking", by the gateway's clock. */
    hearing(c, m) {
      const ctx = c.context;
      if (!ctx || Date.now() - c.authorizedAt > 15_000 || typeof m.turnId !== 'string' || !/^[a-f0-9-]{36}$/.test(m.turnId)) return;
      const r = roomOf(ctx.roomId);
      if (m.end) { r.open.delete(m.turnId); schedule(ctx.roomId); return; }
      r.open.set(m.turnId, { memberId: ctx.memberId, at: Date.now() });
      for (const [id, o] of r.open) if (Date.now() - o.at > OPEN_TURN_MS) r.open.delete(id);
      clearTimeout(r.timer); r.timer = null; // never speak while someone is
    },

    /** One finished utterance. Whose words were they? Kept ones join the conversation and wait for the lull. */
    async utterance(c, ctx, m) {
      const turnId = turnIdOf(m.turnId);
      const text = str(m.text, 600).trim();
      const snrDb = typeof m.snrDb === 'number' && Number.isFinite(m.snrDb) ? Math.max(-20, Math.min(100, m.snrDb)) : 0;
      const durationMs = Number.isInteger(m.durationMs) && m.durationMs >= 0 ? Math.min(m.durationMs, 60_000) : 0;
      const r = roomOf(ctx.roomId);
      const now = Date.now();
      const opened = r.open.get(turnId);
      r.open.delete(turnId);
      // Without its onset, the turn began about its length ago (plus the upload that delays the end).
      const entry = { id: turnId, memberId: ctx.memberId, text, snrDb, start: opened?.at ?? now - durationMs - 700, end: now };
      r.heard = r.heard.filter(h => now - h.end < KEEP_HEARD_MS);
      r.heard.push(entry); // seen (still undecided) by an overlapping turn that arrives meanwhile
      // Someone else's overlapping turn is still being finished: wait for it, briefly, so the louder mic decides.
      const others = [...r.open.entries()].filter(([, o]) => o.memberId !== ctx.memberId && o.at <= entry.end + 300).map(([id]) => id);
      if (others.length) {
        await Promise.race([Promise.all(others.map(id => new Promise(res => { r.waiters.set(id, [...(r.waiters.get(id) ?? []), res]); }))), sleep(WAIT_FOR_OTHER_MS)]);
      }
      const levels = Object.fromEntries([...r.levels].map(([k, v]) => [k, median(v)]));
      const verdict = judge(entry, r.heard.filter(h => h !== entry), levels);
      entry.own = verdict.own;
      for (const res of r.waiters.get(turnId) ?? []) res();
      r.waiters.delete(turnId);

      const perspective = perspectiveOf(ctx.roomId, ctx.memberId);
      // A clip is kept only when this person's voice may be (the grandchild's needs a guardian's yes).
      const audioFileId = verdict.own && ctx.clipsAllowed !== false && typeof m.audioFileId === 'string' && m.audioFileId.length <= 80 ? m.audioFileId : '';
      await db.reducers.addUtterance({ id: `${ctx.roomId}:${turnId}`, roomId: ctx.roomId, memberId: ctx.memberId, speakerName: ctx.displayName.slice(0, 80), perspectiveId: perspective?.id ?? '',
        device: DEVICES.includes(m.device) ? m.device : 'desktop', text, snrDb, durationMs, heardAt: entry.start, duplicateOf: verdict.duplicateOf ?? '', reason: verdict.reason, audioFileId }).catch(() => undefined);
      if (!verdict.own) return { own: false, reason: verdict.reason };

      r.levels.set(ctx.memberId, [...(r.levels.get(ctx.memberId) ?? []), snrDb].slice(-12));
      r.auth = c.auth;
      await addTurn({ id: `${ctx.roomId}:${turnId}:p`, roomId: ctx.roomId, who: 'person', memberId: ctx.memberId, speakerName: ctx.displayName.slice(0, 80), perspectiveId: perspective?.id ?? '', text });
      // Each person's conversation language (their device's): the companion answers in the last speaker's.
      r.pending.push({ memberId: ctx.memberId, name: ctx.displayName, text,
        language: LANGS.includes(m.language) ? m.language : 'en', setting: LANGUAGE_SETTINGS.includes(m.setting) ? m.setting : 'auto' });
      r.lastHeardAt = Date.now();
      r.addressed ||= addressesCompanion(text);
      schedule(ctx.roomId);
      return { own: true, reason: 'own', audioFileId: audioFileId || null };
    },

    /** The host's view of the visit (stage, what's been shared, whether it just invited them through). */
    flow(c, ctx, m) {
      if (!ctx.isOwner) return;
      const r = roomOf(ctx.roomId);
      const stage = STAGES.includes(m.stage) ? m.stage : r.flow?.stage ?? 'gathering';
      r.flow = {
        stage, invitedToEnter: !!m.invitedToEnter,
        turnsInPhase: Number.isInteger(m.turnsInPhase) && m.turnsInPhase >= 0 ? Math.min(m.turnsInPhase, 1000) : 0,
        place: typeof m.place === 'string' ? m.place.slice(0, 60) : null,
        media: m.media === 'photo' || m.media === 'video' ? m.media : null,
        mediaCaption: typeof m.mediaCaption === 'string' ? m.mediaCaption.slice(0, 160) : null,
      };
      r.auth ??= c.auth;
      if (!SPEAKING_STAGES.has(stage)) { r.pending = []; clearTimeout(r.timer); r.timer = null; } else schedule(ctx.roomId);
    },

    /** One of the host's own lines (a welcome, "Here we are", a nudge): kept in the conversation and heard by the others. */
    async line(c, ctx, m) {
      const text = str(m.text, 300).trim();
      const id = `${ctx.roomId}:${turnIdOf(m.commandId)}:l`;
      const language = LANGS.includes(m.language) ? m.language : null;
      await addTurn({ id, roomId: ctx.roomId, who: 'companion', text, intent: 'line' });
      roomOf(ctx.roomId).lastSpokeAt = Date.now();
      broadcast(ctx.roomId, { type: 'companion', id, text, intent: 'line', scripted: true, language, speakIn: language }, c);
    },

    /** Someone spoke over the companion: the line stops on every device. */
    hush(c, ctx) { broadcast(ctx.roomId, { type: 'hush' }, c); },

    /** Someone joined a visit already under way: the companion welcomes them, to everyone. */
    async joined(c) {
      const ctx = c.context;
      if (!ctx || ctx.isOwner) return;
      const r = roomOf(ctx.roomId);
      if (r.welcomed.has(ctx.memberId) || inRoom(ctx.roomId).every(o => o.context.memberId === ctx.memberId)) return;
      r.welcomed.add(ctx.memberId);
      const name = generic(ctx.displayName) ? null : ctx.displayName;
      const text = name ? `${name}’s here too. Welcome, ${name}.` : 'Welcome. Now we’re all here together.'; // kept as English
      const id = `${ctx.roomId}:${crypto.randomUUID()}:c`;
      await addTurn({ id, roomId: ctx.roomId, who: 'companion', text, intent: 'welcome' });
      r.lastSpokeAt = Date.now();
      broadcast(ctx.roomId, { type: 'companion', id, text, intent: 'welcome', line: name ? 'joinedToo' : 'allHere', name }); // each device says it in its own language
    },
  };
}
