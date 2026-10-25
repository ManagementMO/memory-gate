// Perspectives over the exchange: the grandparent's and the grandchild's way of seeing a visit, each person's live head
// and hands in the memory, and everything said while seeing through a perspective (stories, the things it adds to the
// place, the companion's thread with it, archive photographs pinned to it, the likeness each person wears). It rides
// the same private SpacetimeDB connection and the same Convex check as the rest of the gateway: roomId and memberId
// always come from that check, never from the browser, and each room's devices only ever receive their own room.
import { createHash } from 'node:crypto';
import { makeFunctionReference } from 'convex/server';
import { safeArchiveUrl } from '../../actors/historical-memory-atlas/src/archive.mjs';

const TABLES = ['perspective', 'perspectiveStory', 'perspectiveObject', 'companionTurn', 'companionSummary', 'handoff', 'perspectivePin', 'avatar', 'perspectiveSpot'];
export const SOCIAL_SUBSCRIPTIONS = ['perspective', 'pose', 'perspective_story', 'perspective_object', 'companion_turn', 'companion_summary', 'handoff', 'perspective_pin', 'avatar', 'perspective_spot'].map(t => `SELECT * FROM ${t}`);
const ACTIONS = new Set(['claim', 'perspective-settings', 'story', 'story-remove', 'object', 'object-remove', 'turn', 'summary', 'pass-story', 'respond-handoff', 'pin-perspective', 'unpin-perspective', 'place-pin', 'avatar', 'avatar-clear', 'spot']);
const DEVICES = ['headset', 'phone', 'desktop'];
const POSES_PER_SECOND = 20;
const IMAGE_MAX = 5_000_000;
const IMAGE_CACHE_MAX = 20_000_000;

const bad = () => new Error('Invalid request.');
function str(v, max, empty = false) {
  if (typeof v !== 'string' || v.length > max || (!empty && !v.trim())) throw bad();
  return v;
}
function vec(v, lengths) {
  if (!Array.isArray(v) || !lengths.includes(v.length) || !v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100)) throw bad();
  return v;
}
const uuid = (v) => { if (typeof v !== 'string' || !/^[a-f0-9-]{36}$/.test(v)) throw new Error('A valid command is required.'); return v; };
const json = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Only the plan-object fields the sketch draws; everything else the browser sent is dropped. */
function planObject(o) {
  if (!o || typeof o !== 'object' || !/^[A-Za-z0-9_-]{1,60}$/.test(o.id ?? '')) throw bad();
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
  return {
    id: o.id, kind: str(o.kind, 40), label: str(o.label, 40), color: text(o.color, 9), material: text(o.material, 12),
    zone: text(o.zone, 12) ?? 'center', relation: text(o.relation, 14) ?? 'none', target: text(o.target, 60),
    scale: typeof o.scale === 'number' && Number.isFinite(o.scale) ? Math.min(3, Math.max(0.3, o.scale)) : 1, quote: text(o.quote, 300),
  };
}
function placement(p, id) {
  if (!p || typeof p !== 'object') throw bad();
  const n = (k, max) => { if (typeof p[k] !== 'number' || !Number.isFinite(p[k]) || Math.abs(p[k]) > max) throw bad(); return p[k]; };
  return JSON.stringify({ id, x: n('x', 8), y: n('y', 4), z: n('z', 8), yaw: n('yaw', 7), scale: Math.max(0.1, n('scale', 4)), on: typeof p.on === 'string' ? p.on.slice(0, 60) : null });
}

export function createSocial({ db, clients, send, convex, authorize, isReady }) {
  const rows = (table, roomId) => [...db.db[table].iter()].filter(r => r.roomId === roomId);
  const fresh = (c, roomId) => c.context?.roomId === roomId && Date.now() - c.authorizedAt < 15_000;

  function snapshot(roomId) {
    return {
      perspectives: rows('perspective', roomId).sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key)),
      stories: rows('perspectiveStory', roomId).map(s => ({ ...s, at: Array.from(s.at) })).sort((a, b) => a.createdAt - b.createdAt),
      objects: rows('perspectiveObject', roomId).map(o => ({ ...o, data: json(o.data, null), placement: json(o.placement, null) })).filter(o => o.data && o.placement),
      turns: rows('companionTurn', roomId).sort((a, b) => a.createdAt - b.createdAt),
      summaries: rows('companionSummary', roomId),
      handoffs: rows('handoff', roomId),
      pins: rows('perspectivePin', roomId).map(p => ({ ...p, data: json(p.data, null), placement: json(p.placement, null) })).filter(p => p.data && p.placement),
      // A child's likeness only ever travels with a guardian's agreement (the module refuses it otherwise, too).
      avatars: rows('avatar', roomId).filter(a => !a.subjectIsMinor || a.guardianConsent).map(a => ({ memberId: a.memberId, url: a.url, bytes: a.bytes })),
      spots: rows('perspectiveSpot', roomId).map(({ perspectiveId, memoryId, x, z, objectId, source, quote, updatedAt }) => ({ perspectiveId, memoryId, x, z, objectId, source, quote, updatedAt })),
    };
  }
  const posesOf = (roomId) => rows('pose', roomId).map(p => ({ memberId: p.memberId, perspectiveId: p.perspectiveId, device: p.device, inScene: p.inScene, head: Array.from(p.head), left: Array.from(p.left), right: Array.from(p.right), updatedAt: p.updatedAt }));

  // Changes arrive in bursts (a handoff accepted copies a story and its things): one push per room per burst.
  const dirty = new Set(); let timer = null;
  const touch = (roomId) => { dirty.add(roomId); timer ??= setTimeout(flush, 40); };
  function flush() {
    timer = null;
    for (const roomId of dirty) { const social = snapshot(roomId); for (const c of clients) if (fresh(c, roomId)) send(c, { type: 'social', social }); }
    dirty.clear();
  }
  for (const t of TABLES) {
    db.db[t].onInsert((_ctx, r) => touch(r.roomId)); db.db[t].onUpdate((_ctx, _old, r) => touch(r.roomId)); db.db[t].onDelete((_ctx, r) => touch(r.roomId));
  }
  // Heads and hands: at most ~15 pushes a second per room, each the whole room's poses (a handful of rows).
  const poseDirty = new Set(); let poseTimer = null;
  const touchPose = (roomId) => { poseDirty.add(roomId); poseTimer ??= setTimeout(flushPoses, 66); };
  function flushPoses() {
    poseTimer = null;
    for (const roomId of poseDirty) { const poses = posesOf(roomId); for (const c of clients) if (fresh(c, roomId)) send(c, { type: 'poses', poses, now: Date.now() }); }
    poseDirty.clear();
  }
  db.db.pose.onInsert((_ctx, r) => touchPose(r.roomId)); db.db.pose.onUpdate((_ctx, _old, r) => touchPose(r.roomId)); db.db.pose.onDelete((_ctx, r) => touchPose(r.roomId));

  async function context(c) {
    const ctx = c.context && Date.now() - c.authorizedAt < 10_000 ? c.context : await authorize(c);
    if (!isReady()) throw new Error('The exchange is not connected.');
    c.context = ctx;
    return ctx;
  }

  /** A pose has its own lane: never queued behind a slow action, never answered, only the latest one is sent. */
  function pose(c, m) {
    const now = Date.now();
    if (now - (c.poseWindow ?? 0) > 1000) { c.poseWindow = now; c.poseCount = 0; }
    if (++c.poseCount > POSES_PER_SECOND || !c.auth) return;
    try {
      c.nextPose = { perspectiveId: str(m.perspectiveId ?? '', 240, true), device: DEVICES.includes(m.device) ? m.device : 'desktop', inScene: !!m.inScene,
        head: vec(m.head ?? [], [0, 7]), left: vec(m.left ?? [], [0, 7]), right: vec(m.right ?? [], [0, 7]) };
    } catch { return; }
    if (c.posing) return;
    c.posing = true;
    void (async () => {
      try {
        while (c.nextPose) {
          const p = c.nextPose; c.nextPose = null;
          const { roomId, memberId } = await context(c);
          await db.reducers.updatePose({ roomId, memberId, ...p });
        }
      } catch { c.nextPose = null; /* the next pose replaces a dropped one */ } finally { c.posing = false; }
    })();
  }

  async function act(c, m) {
    const ctx = await authorize(c);
    if (!isReady()) throw new Error('The exchange is not connected.');
    if (ctx.paused) throw new Error('This room is paused. Resume it before changing memories.');
    c.context = ctx; c.authorizedAt = Date.now();
    const { roomId, memberId, displayName } = ctx;
    const host = !!ctx.isOwner;
    const r = db.reducers;
    switch (m.type) {
      case 'claim': return r.claimPerspective({ roomId, memberId, memberName: displayName, host, perspectiveId: str(m.perspectiveId, 240), claim: !!m.claim });
      case 'perspective-settings': {
        const years = [m.yearFrom, m.yearTo];
        if (!years.every(y => Number.isInteger(y) && y >= 1000 && y <= 2100)) throw bad();
        return r.updatePerspective({ roomId, memberId, host, perspectiveId: str(m.perspectiveId, 240), archivePlace: str(m.archivePlace ?? '', 100, true), yearFrom: m.yearFrom, yearTo: m.yearTo });
      }
      case 'story': return r.addStory({ id: `${roomId}:${uuid(m.commandId)}`, roomId, perspectiveId: str(m.perspectiveId, 240), memoryId: str(m.memoryId ?? '', 180, true),
        kind: m.kind === 'note' ? 'note' : 'story', text: str(m.text, 2000), objectId: str(m.objectId ?? '', 120, true), at: vec(m.at ?? [], [0, 3]),
        speakerId: memberId, speakerName: displayName, audioFileId: str(m.audioFileId ?? '', 180, true) });
      case 'story-remove': return r.removeStory({ id: str(m.storyId, 240), roomId, memberId, host });
      case 'object': {
        const obj = planObject(m.object);
        const perspectiveId = str(m.perspectiveId, 240);
        return r.addObject({ id: `${perspectiveId}:${obj.id}`, roomId, perspectiveId, memoryId: str(m.memoryId ?? '', 180, true), storyId: str(m.storyId ?? '', 240, true),
          data: JSON.stringify(obj), placement: placement(m.placement, obj.id), addedBy: memberId, addedByName: displayName });
      }
      case 'object-remove': return r.removeObject({ id: str(m.objectId, 240), roomId, memberId, host });
      case 'turn': return r.addTurn({ id: `${roomId}:${uuid(m.commandId)}`, roomId, perspectiveId: str(m.perspectiveId, 240), who: m.who === 'companion' ? 'companion' : 'person',
        speakerName: m.who === 'companion' ? 'Companion' : displayName, text: str(m.text, 600) });
      case 'summary': {
        if (!Number.isInteger(m.turnCount) || m.turnCount < 0 || m.turnCount > 100_000) throw bad();
        return r.setSummary({ roomId, perspectiveId: str(m.perspectiveId, 240), summary: str(m.summary, 1200), turnCount: m.turnCount });
      }
      case 'pass-story': return r.passStory({ roomId, storyId: str(m.storyId, 240), toPerspectiveId: str(m.toPerspectiveId, 240), senderId: memberId, senderName: displayName });
      case 'respond-handoff': {
        if (!Number.isInteger(m.revision) || m.revision < 0 || m.revision > 0xffffffff) throw new Error('Invalid memory revision.');
        return r.respondHandoff({ id: str(m.handoffId, 300), roomId, memberId, memberName: displayName, host, accept: !!m.accept, expectedRevision: m.revision });
      }
      case 'pin-perspective': {
        // Only a record this device was just shown by a search (the same rule as the shared board).
        const ref = c.references?.get(m.referenceId);
        if (!ref) throw new Error('Search and review a photograph before pinning it.');
        const perspectiveId = str(m.perspectiveId, 240);
        const key = sha(ref.sourceUrl);
        await r.pinToPerspective({ id: `${perspectiveId}:${key}`, roomId, perspectiveId, memberId, memberName: displayName, data: JSON.stringify(ref), placement: placement(m.placement, key.slice(0, 12)) });
        // Also on the family's shared board (the album's "From the archive" row), unless that board is full.
        await r.pinReference({ id: `${roomId}:${key}`, roomId, memberId, data: JSON.stringify(ref) }).catch(() => undefined);
        return;
      }
      case 'unpin-perspective': return r.unpinFromPerspective({ id: str(m.pinId, 300), roomId, memberId, host });
      case 'place-pin': return r.placePin({ id: str(m.pinId, 300), roomId, memberId, host, placement: placement(m.placement, 'pin') });
      case 'avatar': {
        const a = await convex.query(makeFunctionReference('avatars:resolve'), { secret: process.env.WORKER_SECRET, key: str(m.key, 80) });
        if (!a) throw new Error('That likeness is not available. It may have been removed.');
        return r.setAvatar({ roomId, memberId, avatarId: a.id, url: a.url, bytes: a.bytes, subjectIsMinor: a.subjectIsMinor, guardianConsent: a.guardianConsent });
      }
      case 'avatar-clear': return r.clearAvatar({ roomId, memberId });
      case 'spot': {
        if (![m.x, m.z].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 8)) throw bad();
        return r.setSpot({ roomId, perspectiveId: str(m.perspectiveId, 240), memoryId: str(m.memoryId, 180), x: m.x, z: m.z, objectId: str(m.objectId ?? '', 120, true),
          source: m.source === 'story' ? 'story' : 'default', quote: str(m.quote ?? '', 300, true), memberId });
      }
    }
    throw new Error('Unknown exchange action.');
  }

  /** After a join: make sure the room's two perspectives exist, then hand this device everything at once. */
  async function joined(c) {
    if (!c.context || !isReady()) return;
    const { roomId } = c.context;
    await db.reducers.ensurePerspectives({ roomId }).catch(() => undefined);
    send(c, { type: 'social', social: snapshot(roomId) });
    send(c, { type: 'poses', poses: posesOf(roomId), now: Date.now() });
  }
  async function left(ctx) {
    if (!ctx || !isReady()) return;
    if ([...clients].some(o => o.context?.memberId === ctx.memberId)) return; // still here on another connection
    await db.reducers.dropPose({ roomId: ctx.roomId, memberId: ctx.memberId }).catch(() => undefined);
  }

  /** Likenesses revoked in Convex disappear from the visit within one pass (every 10 s). */
  let reconciling = false;
  async function reconcileAvatars() {
    if (!isReady() || reconciling || !process.env.WORKER_SECRET) return;
    reconciling = true;
    try {
      const all = [...db.db.avatar.iter()];
      for (let i = 0; i < all.length; i += 100) {
        const chunk = all.slice(i, i + 100);
        const active = new Set(await convex.query(makeFunctionReference('avatars:activeIds'), { secret: process.env.WORKER_SECRET, ids: [...new Set(chunk.map(a => a.avatarId))] }));
        for (const a of chunk) if (!active.has(a.avatarId)) await db.reducers.clearAvatar({ roomId: a.roomId, memberId: a.memberId });
      }
    } catch { console.warn('Avatar reconciliation will retry; no likeness was removed on a failed query.'); }
    finally { reconciling = false; }
  }
  const roomIds = () => [...db.db.perspective.iter()].map(p => p.roomId);

  // Pinned public-domain photographs, served from this origin so WebGL can use them as textures (no CORS from loc.gov).
  const images = new Map(); let imageBytes = 0;
  async function archiveImage(req, res) {
    const fail = (code) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(); };
    try {
      const pinId = decodeURIComponent(req.url.slice('/exchange/archive-image/'.length).split('?')[0]);
      const hit = images.get(pinId);
      if (hit) { res.writeHead(200, { 'Content-Type': hit.type, 'Cache-Control': 'private, max-age=3600' }); res.end(hit.body); return; }
      const pin = db.db.perspectivePin.id.find(pinId);
      const url = pin ? safeArchiveUrl(json(pin.data, {}).imageUrl ?? '', true) : null;
      if (!url) return fail(404);
      const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
      const type = upstream.headers.get('content-type') ?? '';
      if (!upstream.ok || !/^image\/(jpeg|png|gif|webp)/.test(type) || Number(upstream.headers.get('content-length') ?? 0) > IMAGE_MAX) return fail(502);
      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.length > IMAGE_MAX) return fail(502);
      images.set(pinId, { type, body }); imageBytes += body.length;
      for (const [k, v] of images) { if (imageBytes <= IMAGE_CACHE_MAX) break; images.delete(k); imageBytes -= v.body.length; }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' }); res.end(body);
    } catch { fail(502); }
  }

  return { handles: (type) => ACTIONS.has(type), act, pose, joined, left, reconcileAvatars, roomIds, archiveImage };
}
