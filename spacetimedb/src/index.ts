import { schema, table, t, SenderError, type ReducerCtx } from 'spacetimedb/server';

// All tables are PRIVATE. Only the publishing identity can call these reducers or
// subscribe. The gateway rechecks Convex membership and consent before exposing rows.
const db = schema({
  operator: table({}, { id: t.u32().primaryKey(), identity: t.identity() }),
  capsule: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), sourceId: t.string(), senderId: t.string(), recipientId: t.string(),
    title: t.string(), status: t.string(), revision: t.u32(), createdAt: t.f64(), updatedAt: t.f64(),
  }),
  reference: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), addedBy: t.string(), data: t.string(), createdAt: t.f64(),
  }),
  // Who is in a visit right now (one row per member): each person's light, its colour and seat, and their latest
  // "look here" mark. Heartbeats refresh updatedAt; leftAt is set when they close the page (0 while present).
  presence: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    memberId: t.string().primaryKey(), roomId: t.string(), host: t.bool(), seat: t.u32(), color: t.string(), device: t.string(),
    pointX: t.f64(), pointY: t.f64(), pointZ: t.f64(), pointAt: t.f64(), updatedAt: t.f64(), leftAt: t.f64(),
  }),
  // Perspectives: every visit can be seen two ways, the grandparent's and the grandchild's. Someone may claim one;
  // whatever is said while seeing through it stays with it.
  perspective: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), key: t.string(), label: t.string(), eyeHeight: t.f32(), color: t.string(),
    claimedBy: t.string(), claimedName: t.string(), archivePlace: t.string(), yearFrom: t.u32(), yearTo: t.u32(), createdAt: t.f64(),
  }),
  // Where each person is in the memory right now (world space, metres): head [x y z qx qy qz qw], hands the same or [].
  pose: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    memberId: t.string().primaryKey(), roomId: t.string(), perspectiveId: t.string(), device: t.string(), inScene: t.bool(),
    head: t.array(t.f32()), left: t.array(t.f32()), right: t.array(t.f32()), updatedAt: t.f64(),
  }),
  // A story or note told from one perspective (attributed to whoever said it), optionally about a thing or a spot.
  perspectiveStory: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), perspectiveId: t.string(), memoryId: t.string(), kind: t.string(), text: t.string(),
    objectId: t.string(), at: t.array(t.f32()), speakerId: t.string(), speakerName: t.string(), audioFileId: t.string(), handedFrom: t.string(), createdAt: t.f64(),
  }),
  // Things only one perspective remembers: a plan object (JSON) at a fixed placement, so every device draws it in the same spot.
  perspectiveObject: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), perspectiveId: t.string(), memoryId: t.string(), storyId: t.string(),
    data: t.string(), placement: t.string(), addedBy: t.string(), addedByName: t.string(), createdAt: t.f64(),
  }),
  // The companion's thread with each perspective (the last 40 turns) and a short summary of it.
  companionTurn: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }, { accessor: 'byPerspective', algorithm: 'btree', columns: ['perspectiveId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), perspectiveId: t.string(), who: t.string(), speakerName: t.string(), text: t.string(), createdAt: t.f64(),
  }),
  companionSummary: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    perspectiveId: t.string().primaryKey(), roomId: t.string(), summary: t.string(), turnCount: t.u32(), updatedAt: t.f64(),
  }),
  // A story handed from one perspective to the other, waiting to be accepted there.
  handoff: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), storyId: t.string(), fromPerspectiveId: t.string(), toPerspectiveId: t.string(),
    senderId: t.string(), senderName: t.string(), status: t.string(), respondedBy: t.string(), revision: t.u32(), createdAt: t.f64(), updatedAt: t.f64(),
  }),
  // A public archive photograph pinned to one perspective (verified like `reference`), and where it hangs.
  perspectivePin: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), perspectiveId: t.string(), data: t.string(), placement: t.string(),
    addedBy: t.string(), addedByName: t.string(), createdAt: t.f64(),
  }),
  // Where each perspective stands in a memory (relative to its centre, metres): opposite sides of the room by default,
  // then wherever the story puts them ("by the stove"). Switching perspective takes you there, facing the other.
  perspectiveSpot: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), perspectiveId: t.string(), memoryId: t.string(), x: t.f32(), z: t.f32(),
    objectId: t.string(), source: t.string(), quote: t.string(), setBy: t.string(), updatedAt: t.f64(),
  }),
  // The likeness a member wears in this visit (a GLB in Convex storage). A minor's needs a guardian's consent.
  avatar: table({ indexes: [{ accessor: 'byRoom', algorithm: 'btree', columns: ['roomId'] }] }, {
    id: t.string().primaryKey(), roomId: t.string(), memberId: t.string(), avatarId: t.string(), url: t.string(), bytes: t.u32(),
    subjectIsMinor: t.bool(), guardianConsent: t.bool(), consentedAt: t.f64(), updatedAt: t.f64(),
  }),
});
export default db;
export const init = db.init(ctx => { ctx.db.operator.insert({ id: 0, identity: ctx.sender }); });
type Ctx = ReducerCtx<typeof db.schemaType>;
function requireOperator(ctx: Ctx) {
  const owner = ctx.db.operator.id.find(0);
  if (!owner || !owner.identity.isEqual(ctx.sender)) throw new SenderError('Only the authenticated gateway may mutate the exchange.');
}
function bounded(value: string, max: number, label: string) {
  if (!value.trim() || value.length > max) throw new SenderError(`Invalid ${label}.`);
}
export const passMemory = db.reducer({ id: t.string(), roomId: t.string(), sourceId: t.string(), senderId: t.string(), recipientId: t.string(), title: t.string() }, (ctx, a) => {
  requireOperator(ctx);
  for (const key of ['id', 'roomId', 'sourceId', 'senderId', 'recipientId'] as const) bounded(a[key], 180, key);
  bounded(a.title, 80, 'title');
  if (a.senderId === a.recipientId) throw new SenderError('Choose another participant.');
  const previous = ctx.db.capsule.id.find(a.id);
  if (previous) {
    if (previous.roomId !== a.roomId || previous.senderId !== a.senderId || previous.recipientId !== a.recipientId || previous.sourceId !== a.sourceId || previous.title !== a.title) throw new SenderError('Command ID already used.');
    return;
  }
  if ([...ctx.db.capsule.byRoom.filter(a.roomId)].length >= 200) throw new SenderError('This room has reached its 200-memory limit.');
  const now = Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
  ctx.db.capsule.insert({ ...a, status: 'pending', revision: 0, createdAt: now, updatedAt: now });
});
export const respondMemory = db.reducer({ id: t.string(), roomId: t.string(), memberId: t.string(), status: t.string(), expectedRevision: t.u32() }, (ctx, a) => {
  requireOperator(ctx);
  const c = ctx.db.capsule.id.find(a.id);
  if (!c || c.roomId !== a.roomId) throw new SenderError('Memory not found.');
  const senderAction = a.status === 'revoked';
  if ((senderAction ? c.senderId : c.recipientId) !== a.memberId) throw new SenderError('This memory is addressed to someone else.');
  if (!['accepted', 'dismissed', 'revoked'].includes(a.status)) throw new SenderError('Invalid response.');
  if (c.status === a.status) return; // idempotent retry, including after reconnection
  if (c.revision !== a.expectedRevision) throw new SenderError('This memory changed. Review its current state.');
  const allowed = a.status === 'revoked' ? c.status !== 'revoked' : a.status === 'accepted' ? c.status === 'pending' : ['pending', 'accepted'].includes(c.status);
  if (!allowed) throw new SenderError('This memory is no longer available for that action.');
  ctx.db.capsule.id.update({ ...c, status: a.status, revision: c.revision + 1, updatedAt: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n) });
});
export const pinReference = db.reducer({ id: t.string(), roomId: t.string(), memberId: t.string(), data: t.string() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.data, 12000, 'reference'); bounded(a.id, 300, 'reference ID');
  const ref = JSON.parse(a.data);
  if (typeof ref.sourceUrl !== 'string' || !/^https:\/\/(www\.)?loc\.gov\//.test(ref.sourceUrl) || ref.provenance !== 'public-archive') throw new SenderError('A verified archive record is required.');
  const prior = ctx.db.reference.id.find(a.id);
  if (prior) { if (prior.roomId !== a.roomId) throw new SenderError('Reference belongs to another room.'); return; }
  if ([...ctx.db.reference.byRoom.filter(a.roomId)].length >= 40) throw new SenderError('This board has reached its 40-reference limit.');
  ctx.db.reference.insert({ id: a.id, roomId: a.roomId, addedBy: a.memberId, data: a.data, createdAt: Number(ctx.timestamp.microsSinceUnixEpoch / 1000n) });
});
export const unpinReference = db.reducer({ id: t.string(), roomId: t.string(), memberId: t.string() }, (ctx, a) => {
  requireOperator(ctx); const r = ctx.db.reference.id.find(a.id); if (!r) return;
  if (r.roomId !== a.roomId || r.addedBy !== a.memberId) throw new SenderError('Only the contributor can remove this reference.');
  ctx.db.reference.id.delete(a.id);
});
export const purgeRoom = db.reducer({ roomId: t.string() }, (ctx, { roomId }) => {
  requireOperator(ctx);
  for (const row of [...ctx.db.capsule.byRoom.filter(roomId)]) ctx.db.capsule.id.delete(row.id);
  for (const row of [...ctx.db.reference.byRoom.filter(roomId)]) ctx.db.reference.id.delete(row.id);
  for (const row of [...ctx.db.presence.byRoom.filter(roomId)]) ctx.db.presence.memberId.delete(row.memberId);
  for (const row of [...ctx.db.perspective.byRoom.filter(roomId)]) ctx.db.perspective.id.delete(row.id);
  for (const row of [...ctx.db.pose.byRoom.filter(roomId)]) ctx.db.pose.memberId.delete(row.memberId);
  for (const row of [...ctx.db.perspectiveStory.byRoom.filter(roomId)]) ctx.db.perspectiveStory.id.delete(row.id);
  for (const row of [...ctx.db.perspectiveObject.byRoom.filter(roomId)]) ctx.db.perspectiveObject.id.delete(row.id);
  for (const row of [...ctx.db.companionTurn.byRoom.filter(roomId)]) ctx.db.companionTurn.id.delete(row.id);
  for (const row of [...ctx.db.companionSummary.byRoom.filter(roomId)]) ctx.db.companionSummary.perspectiveId.delete(row.perspectiveId);
  for (const row of [...ctx.db.handoff.byRoom.filter(roomId)]) ctx.db.handoff.id.delete(row.id);
  for (const row of [...ctx.db.perspectivePin.byRoom.filter(roomId)]) ctx.db.perspectivePin.id.delete(row.id);
  for (const row of [...ctx.db.avatar.byRoom.filter(roomId)]) ctx.db.avatar.id.delete(row.id);
  for (const row of [...ctx.db.perspectiveSpot.byRoom.filter(roomId)]) ctx.db.perspectiveSpot.id.delete(row.id);
});

// Being together: the gateway calls these for a member it has just checked in Convex.
const LIGHT_COLORS = ['#ffd27a', '#ff9fb2', '#8fd3ff', '#a8eec0', '#cdb4ff', '#ffbf94'];
const nowMs = (ctx: Ctx) => Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
export const beHere = db.reducer({ roomId: t.string(), memberId: t.string(), host: t.bool(), device: t.string() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.roomId, 180, 'roomId'); bounded(a.memberId, 180, 'memberId');
  if (!['headset', 'phone', 'desktop'].includes(a.device)) throw new SenderError('Invalid device.');
  const now = nowMs(ctx);
  const mine = ctx.db.presence.memberId.find(a.memberId);
  if (mine) {
    if (mine.roomId !== a.roomId) throw new SenderError('Presence belongs to another room.');
    ctx.db.presence.memberId.update({ ...mine, host: a.host, device: a.device, updatedAt: now, leftAt: 0 });
    return;
  }
  const seat = [...ctx.db.presence.byRoom.filter(a.roomId)].length;
  if (seat >= 64) throw new SenderError('This visit is full.');
  ctx.db.presence.insert({ memberId: a.memberId, roomId: a.roomId, host: a.host, seat, color: LIGHT_COLORS[seat % LIGHT_COLORS.length]!, device: a.device,
    pointX: 0, pointY: 0, pointZ: 0, pointAt: 0, updatedAt: now, leftAt: 0 });
});
export const markPoint = db.reducer({ roomId: t.string(), memberId: t.string(), x: t.f64(), y: t.f64(), z: t.f64() }, (ctx, a) => {
  requireOperator(ctx);
  const mine = ctx.db.presence.memberId.find(a.memberId);
  if (!mine || mine.roomId !== a.roomId) throw new SenderError('Join the visit first.');
  if (![a.x, a.y, a.z].every(v => Number.isFinite(v) && Math.abs(v) < 1000)) throw new SenderError('Invalid point.');
  const now = nowMs(ctx);
  ctx.db.presence.memberId.update({ ...mine, pointX: a.x, pointY: a.y, pointZ: a.z, pointAt: now, updatedAt: now, leftAt: 0 });
});
export const leaveVisit = db.reducer({ roomId: t.string(), memberId: t.string() }, (ctx, a) => {
  requireOperator(ctx);
  const mine = ctx.db.presence.memberId.find(a.memberId);
  if (mine && mine.roomId === a.roomId) ctx.db.presence.memberId.update({ ...mine, leftAt: nowMs(ctx) });
});

// ---------------------------------------------------------------- perspectives (the social experience)
// The gateway calls these for a member it has just checked in Convex: roomId and memberId always come from that check,
// never from the browser. Each perspective keeps its own stories, the things it adds to the place, the companion's
// thread with it and its archive photographs; poses are everyone's live head and hands in the memory.
// Eye heights are the two people the gate shows (apps/gate/src/social/avatar/people.ts): a grandmother and a boy.
// `was`: the first defaults, which a visit made before them moves to these.
const PERSONAS = [
  { key: 'grandparent', label: 'Grandparent', eyeHeight: 1.45, was: 1.6, color: '#8fb8ff' },
  { key: 'child', label: 'Grandchild', eyeHeight: 1.21, was: 1.1, color: '#ffb48f' },
] as const;
const finite = (v: number, max: number) => Number.isFinite(v) && Math.abs(v) <= max;
function vector(v: number[], lengths: number[], label: string) {
  if (!lengths.includes(v.length) || !v.every(n => finite(n, 100))) throw new SenderError(`Invalid ${label}.`);
}
function perspectiveIn(ctx: Ctx, roomId: string, perspectiveId: string) {
  const p = ctx.db.perspective.id.find(perspectiveId);
  if (!p || p.roomId !== roomId) throw new SenderError('That perspective is not part of this visit.');
  return p;
}
function placement(json: string) {
  bounded(json, 400, 'placement');
  let p: Record<string, unknown>;
  try { p = JSON.parse(json); } catch { throw new SenderError('Invalid placement.'); }
  const n = (k: string, max: number) => typeof p[k] === 'number' && finite(p[k] as number, max);
  if (!n('x', 8) || !n('y', 4) || !n('z', 8) || !n('yaw', 7) || !n('scale', 4) || (p.scale as number) < 0.1) throw new SenderError('Invalid placement.');
}
const mayChange = (owner: string, memberId: string, host: boolean) => owner === memberId || host;

export const ensurePerspectives = db.reducer({ roomId: t.string() }, (ctx, { roomId }) => {
  requireOperator(ctx); bounded(roomId, 180, 'roomId');
  for (const p of PERSONAS) {
    const id = `${roomId}:${p.key}`;
    const row = ctx.db.perspective.id.find(id);
    if (row) { if (Math.abs(row.eyeHeight - p.was) < 1e-3) ctx.db.perspective.id.update({ ...row, eyeHeight: p.eyeHeight }); continue; }
    ctx.db.perspective.insert({ id, roomId, key: p.key, label: p.label, eyeHeight: p.eyeHeight, color: p.color, claimedBy: '', claimedName: '', archivePlace: '', yearFrom: 1900, yearTo: 1980, createdAt: nowMs(ctx) });
  }
});

/** Claim a perspective (one per person) or let it go. Unclaimed ones are open to anyone; the host may reassign. */
export const claimPerspective = db.reducer({ roomId: t.string(), memberId: t.string(), memberName: t.string(), host: t.bool(), perspectiveId: t.string(), claim: t.bool() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.memberName, 80, 'name');
  const p = perspectiveIn(ctx, a.roomId, a.perspectiveId);
  if (!a.claim) {
    if (!p.claimedBy) return;
    if (!mayChange(p.claimedBy, a.memberId, a.host)) throw new SenderError('Only the person seeing through it can let it go.');
    ctx.db.perspective.id.update({ ...p, claimedBy: '', claimedName: '' });
    return;
  }
  if (p.claimedBy && p.claimedBy !== a.memberId && !a.host) throw new SenderError(`${p.claimedName || 'Someone'} is already seeing through this one.`);
  for (const other of [...ctx.db.perspective.byRoom.filter(a.roomId)]) {
    if (other.id !== p.id && other.claimedBy === a.memberId) ctx.db.perspective.id.update({ ...other, claimedBy: '', claimedName: '' });
  }
  ctx.db.perspective.id.update({ ...p, claimedBy: a.memberId, claimedName: a.memberName });
});

/** What a perspective's archive search starts from (the place and years it remembers). */
export const updatePerspective = db.reducer({ roomId: t.string(), memberId: t.string(), host: t.bool(), perspectiveId: t.string(), archivePlace: t.string(), yearFrom: t.u32(), yearTo: t.u32() }, (ctx, a) => {
  requireOperator(ctx);
  const p = perspectiveIn(ctx, a.roomId, a.perspectiveId);
  if (p.claimedBy && !mayChange(p.claimedBy, a.memberId, a.host)) throw new SenderError('Only the person seeing through it can change it.');
  if (a.archivePlace.length > 100 || a.yearFrom < 1000 || a.yearTo > 2100 || a.yearFrom > a.yearTo) throw new SenderError('Invalid place or years.');
  ctx.db.perspective.id.update({ ...p, archivePlace: a.archivePlace.trim(), yearFrom: a.yearFrom, yearTo: a.yearTo });
});

/** Which perspective someone is seeing through, and (in the memory) where their head and hands are. */
export const updatePose = db.reducer({ roomId: t.string(), memberId: t.string(), perspectiveId: t.string(), device: t.string(), inScene: t.bool(), head: t.array(t.f32()), left: t.array(t.f32()), right: t.array(t.f32()) }, (ctx, a) => {
  requireOperator(ctx); bounded(a.memberId, 180, 'memberId');
  if (!['headset', 'phone', 'desktop'].includes(a.device)) throw new SenderError('Invalid device.');
  if (a.perspectiveId) perspectiveIn(ctx, a.roomId, a.perspectiveId);
  vector(a.head, [0, 7], 'head'); vector(a.left, [0, 7], 'hand'); vector(a.right, [0, 7], 'hand');
  const row = { memberId: a.memberId, roomId: a.roomId, perspectiveId: a.perspectiveId, device: a.device, inScene: a.inScene, head: a.head, left: a.left, right: a.right, updatedAt: nowMs(ctx) };
  const mine = ctx.db.pose.memberId.find(a.memberId);
  if (!mine) { ctx.db.pose.insert(row); return; }
  if (mine.roomId !== a.roomId) throw new SenderError('This pose belongs to another visit.');
  ctx.db.pose.memberId.update(row);
});
export const dropPose = db.reducer({ roomId: t.string(), memberId: t.string() }, (ctx, a) => {
  requireOperator(ctx);
  const mine = ctx.db.pose.memberId.find(a.memberId);
  if (mine && mine.roomId === a.roomId) ctx.db.pose.memberId.delete(a.memberId);
});

/** A story or note, kept with the perspective it was told from. Retries with the same id are harmless. */
export const addStory = db.reducer({ id: t.string(), roomId: t.string(), perspectiveId: t.string(), memoryId: t.string(), kind: t.string(), text: t.string(), objectId: t.string(), at: t.array(t.f32()), speakerId: t.string(), speakerName: t.string(), audioFileId: t.string() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.id, 240, 'story ID'); bounded(a.text, 2000, 'story'); bounded(a.speakerName, 80, 'speaker');
  if (!['story', 'note'].includes(a.kind)) throw new SenderError('Invalid story kind.');
  if (a.memoryId.length > 180 || a.objectId.length > 120 || a.audioFileId.length > 180) throw new SenderError('Invalid story reference.');
  vector(a.at, [0, 3], 'spot');
  perspectiveIn(ctx, a.roomId, a.perspectiveId);
  const prior = ctx.db.perspectiveStory.id.find(a.id);
  if (prior) { if (prior.roomId !== a.roomId) throw new SenderError('Story ID already used.'); return; }
  if ([...ctx.db.perspectiveStory.byRoom.filter(a.roomId)].length >= 500) throw new SenderError('This visit has reached its 500-story limit.');
  ctx.db.perspectiveStory.insert({ ...a, text: a.text.trim(), handedFrom: '', createdAt: nowMs(ctx) });
});
export const removeStory = db.reducer({ id: t.string(), roomId: t.string(), memberId: t.string(), host: t.bool() }, (ctx, a) => {
  requireOperator(ctx);
  const s = ctx.db.perspectiveStory.id.find(a.id);
  if (!s) return;
  if (s.roomId !== a.roomId || !mayChange(s.speakerId, a.memberId, a.host)) throw new SenderError('Only the person who told it can remove this story.');
  ctx.db.perspectiveStory.id.delete(s.id);
  for (const o of [...ctx.db.perspectiveObject.byRoom.filter(a.roomId)]) if (o.storyId === s.id) ctx.db.perspectiveObject.id.delete(o.id);
  for (const h of [...ctx.db.handoff.byRoom.filter(a.roomId)]) if (h.storyId === s.id && h.status === 'pending') ctx.db.handoff.id.delete(h.id);
});

/** Something only this perspective remembers, at a fixed spot (the same on every device). */
export const addObject = db.reducer({ id: t.string(), roomId: t.string(), perspectiveId: t.string(), memoryId: t.string(), storyId: t.string(), data: t.string(), placement: t.string(), addedBy: t.string(), addedByName: t.string() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.id, 240, 'object ID'); bounded(a.data, 2000, 'object'); placement(a.placement);
  if (a.memoryId.length > 180 || a.storyId.length > 240 || a.addedByName.length > 80) throw new SenderError('Invalid object reference.');
  let o: Record<string, unknown>;
  try { o = JSON.parse(a.data); } catch { throw new SenderError('Invalid object.'); }
  if (typeof o.kind !== 'string' || typeof o.label !== 'string' || !o.kind || o.kind.length > 40 || o.label.length > 40) throw new SenderError('Invalid object.');
  perspectiveIn(ctx, a.roomId, a.perspectiveId);
  const prior = ctx.db.perspectiveObject.id.find(a.id);
  if (prior) { if (prior.roomId !== a.roomId) throw new SenderError('Object ID already used.'); return; }
  const room = [...ctx.db.perspectiveObject.byRoom.filter(a.roomId)];
  if (room.length >= 120 || room.filter(r => r.perspectiveId === a.perspectiveId && r.memoryId === a.memoryId).length >= 24) throw new SenderError('This perspective has added all it can to this place.');
  ctx.db.perspectiveObject.insert({ ...a, createdAt: nowMs(ctx) });
});
export const removeObject = db.reducer({ id: t.string(), roomId: t.string(), memberId: t.string(), host: t.bool() }, (ctx, a) => {
  requireOperator(ctx);
  const o = ctx.db.perspectiveObject.id.find(a.id);
  if (!o) return;
  if (o.roomId !== a.roomId || !mayChange(o.addedBy, a.memberId, a.host)) throw new SenderError('Only the person who added it can remove this.');
  ctx.db.perspectiveObject.id.delete(o.id);
});

/** One turn of the companion's conversation with a perspective; only the latest 40 are kept. */
export const addTurn = db.reducer({ id: t.string(), roomId: t.string(), perspectiveId: t.string(), who: t.string(), speakerName: t.string(), text: t.string() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.id, 240, 'turn ID'); bounded(a.text, 600, 'turn');
  if (!['person', 'companion'].includes(a.who) || a.speakerName.length > 80) throw new SenderError('Invalid turn.');
  perspectiveIn(ctx, a.roomId, a.perspectiveId);
  if (ctx.db.companionTurn.id.find(a.id)) return;
  ctx.db.companionTurn.insert({ ...a, createdAt: nowMs(ctx) });
  const turns = [...ctx.db.companionTurn.byPerspective.filter(a.perspectiveId)].sort((x, y) => x.createdAt - y.createdAt);
  for (const old of turns.slice(0, Math.max(0, turns.length - 40))) ctx.db.companionTurn.id.delete(old.id);
});
export const setSummary = db.reducer({ roomId: t.string(), perspectiveId: t.string(), summary: t.string(), turnCount: t.u32() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.summary, 1200, 'summary');
  perspectiveIn(ctx, a.roomId, a.perspectiveId);
  const row = { perspectiveId: a.perspectiveId, roomId: a.roomId, summary: a.summary.trim(), turnCount: a.turnCount, updatedAt: nowMs(ctx) };
  if (ctx.db.companionSummary.perspectiveId.find(a.perspectiveId)) ctx.db.companionSummary.perspectiveId.update(row);
  else ctx.db.companionSummary.insert(row);
});

/** Hand a story to the other perspective; it waits there until someone seeing through it accepts. */
export const passStory = db.reducer({ roomId: t.string(), storyId: t.string(), toPerspectiveId: t.string(), senderId: t.string(), senderName: t.string() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.senderName, 80, 'name');
  const s = ctx.db.perspectiveStory.id.find(a.storyId);
  if (!s || s.roomId !== a.roomId) throw new SenderError('Story not found.');
  const to = perspectiveIn(ctx, a.roomId, a.toPerspectiveId);
  if (to.id === s.perspectiveId) throw new SenderError('Choose the other perspective.');
  const id = `h:${s.id}>${to.key}`;
  const now = nowMs(ctx);
  const prior = ctx.db.handoff.id.find(id);
  if (prior) {
    if (prior.status === 'declined') ctx.db.handoff.id.update({ ...prior, status: 'pending', senderId: a.senderId, senderName: a.senderName, respondedBy: '', revision: prior.revision + 1, updatedAt: now });
    return;
  }
  if ([...ctx.db.handoff.byRoom.filter(a.roomId)].length >= 200) throw new SenderError('This visit has reached its 200-handoff limit.');
  ctx.db.handoff.insert({ id, roomId: a.roomId, storyId: s.id, fromPerspectiveId: s.perspectiveId, toPerspectiveId: to.id, senderId: a.senderId, senderName: a.senderName, status: 'pending', respondedBy: '', revision: 0, createdAt: now, updatedAt: now });
});

/** Accepting copies the story (and anything it added to the place) into the receiving perspective. */
export const respondHandoff = db.reducer({ id: t.string(), roomId: t.string(), memberId: t.string(), memberName: t.string(), host: t.bool(), accept: t.bool(), expectedRevision: t.u32() }, (ctx, a) => {
  requireOperator(ctx);
  const h = ctx.db.handoff.id.find(a.id);
  if (!h || h.roomId !== a.roomId) throw new SenderError('Handoff not found.');
  const to = perspectiveIn(ctx, a.roomId, h.toPerspectiveId);
  if (to.claimedBy && !mayChange(to.claimedBy, a.memberId, a.host)) throw new SenderError(`This was handed to ${to.claimedName || 'someone else'}.`);
  const status = a.accept ? 'accepted' : 'declined';
  if (h.status === status) return;
  if (h.status !== 'pending') throw new SenderError('This memory has already been answered.');
  if (h.revision !== a.expectedRevision) throw new SenderError('This memory changed. Review it again.');
  const now = nowMs(ctx);
  ctx.db.handoff.id.update({ ...h, status, respondedBy: a.memberName.slice(0, 80), revision: h.revision + 1, updatedAt: now });
  if (!a.accept) return;
  const s = ctx.db.perspectiveStory.id.find(h.storyId);
  if (!s) throw new SenderError('The story is no longer available.');
  const copy = `${s.id}>${to.key}`;
  if (!ctx.db.perspectiveStory.id.find(copy)) ctx.db.perspectiveStory.insert({ ...s, id: copy, perspectiveId: to.id, handedFrom: s.perspectiveId, createdAt: now });
  for (const o of [...ctx.db.perspectiveObject.byRoom.filter(a.roomId)]) {
    if (o.storyId !== s.id || o.perspectiveId !== s.perspectiveId) continue;
    const oid = `${o.id}>${to.key}`;
    if (!ctx.db.perspectiveObject.id.find(oid)) ctx.db.perspectiveObject.insert({ ...o, id: oid, perspectiveId: to.id, storyId: copy, createdAt: now });
  }
});

/** A verified public archive photograph (same checks as the shared board) pinned to one perspective. */
export const pinToPerspective = db.reducer({ id: t.string(), roomId: t.string(), perspectiveId: t.string(), memberId: t.string(), memberName: t.string(), data: t.string(), placement: t.string() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.data, 12000, 'reference'); bounded(a.id, 300, 'reference ID'); placement(a.placement);
  const ref = JSON.parse(a.data);
  if (typeof ref.sourceUrl !== 'string' || !/^https:\/\/(www\.)?loc\.gov\//.test(ref.sourceUrl) || ref.provenance !== 'public-archive') throw new SenderError('A verified archive record is required.');
  perspectiveIn(ctx, a.roomId, a.perspectiveId);
  const prior = ctx.db.perspectivePin.id.find(a.id);
  if (prior) { if (prior.roomId !== a.roomId) throw new SenderError('Reference belongs to another room.'); return; }
  if ([...ctx.db.perspectivePin.byRoom.filter(a.roomId)].filter(p => p.perspectiveId === a.perspectiveId).length >= 12) throw new SenderError('This perspective already has 12 photographs.');
  ctx.db.perspectivePin.insert({ id: a.id, roomId: a.roomId, perspectiveId: a.perspectiveId, data: a.data, placement: a.placement, addedBy: a.memberId, addedByName: a.memberName.slice(0, 80), createdAt: nowMs(ctx) });
});
export const unpinFromPerspective = db.reducer({ id: t.string(), roomId: t.string(), memberId: t.string(), host: t.bool() }, (ctx, a) => {
  requireOperator(ctx);
  const p = ctx.db.perspectivePin.id.find(a.id);
  if (!p) return;
  if (p.roomId !== a.roomId || !mayChange(p.addedBy, a.memberId, a.host)) throw new SenderError('Only the person who pinned it can remove this photograph.');
  ctx.db.perspectivePin.id.delete(p.id);
});
export const placePin = db.reducer({ id: t.string(), roomId: t.string(), memberId: t.string(), host: t.bool(), placement: t.string() }, (ctx, a) => {
  requireOperator(ctx); placement(a.placement);
  const p = ctx.db.perspectivePin.id.find(a.id);
  if (!p || p.roomId !== a.roomId) throw new SenderError('Photograph not found.');
  if (!mayChange(p.addedBy, a.memberId, a.host)) throw new SenderError('Only the person who pinned it can move this photograph.');
  ctx.db.perspectivePin.id.update({ ...p, placement: a.placement });
});

/** The likeness a member wears here. The gateway has already checked consent in Convex; this keeps the rule too. */
export const setAvatar = db.reducer({ roomId: t.string(), memberId: t.string(), avatarId: t.string(), url: t.string(), bytes: t.u32(), subjectIsMinor: t.bool(), guardianConsent: t.bool() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.url, 800, 'avatar URL'); bounded(a.avatarId, 180, 'avatar ID');
  if (!/^(https?:\/\/|\/)/.test(a.url)) throw new SenderError('Invalid avatar URL.');
  if (a.subjectIsMinor && !a.guardianConsent) throw new SenderError('A guardian must agree before a child’s likeness is shown.');
  const id = `${a.roomId}:${a.memberId}`;
  const now = nowMs(ctx);
  const row = { id, roomId: a.roomId, memberId: a.memberId, avatarId: a.avatarId, url: a.url, bytes: a.bytes, subjectIsMinor: a.subjectIsMinor, guardianConsent: a.guardianConsent, consentedAt: now, updatedAt: now };
  const prior = ctx.db.avatar.id.find(id);
  if (prior) ctx.db.avatar.id.update({ ...row, consentedAt: prior.url === a.url ? prior.consentedAt : now });
  else ctx.db.avatar.insert(row);
});
export const clearAvatar = db.reducer({ roomId: t.string(), memberId: t.string() }, (ctx, a) => {
  requireOperator(ctx);
  ctx.db.avatar.id.delete(`${a.roomId}:${a.memberId}`);
});

/** Where a perspective stands in one memory. A spot the story gave is not replaced by a default one. */
export const setSpot = db.reducer({ roomId: t.string(), perspectiveId: t.string(), memoryId: t.string(), x: t.f32(), z: t.f32(), objectId: t.string(), source: t.string(), quote: t.string(), memberId: t.string() }, (ctx, a) => {
  requireOperator(ctx); bounded(a.memoryId, 180, 'memory');
  if (!['default', 'story'].includes(a.source) || !finite(a.x, 8) || !finite(a.z, 8) || a.objectId.length > 120 || a.quote.length > 300) throw new SenderError('Invalid spot.');
  perspectiveIn(ctx, a.roomId, a.perspectiveId);
  const id = `${a.perspectiveId}|${a.memoryId}`;
  const prior = ctx.db.perspectiveSpot.id.find(id);
  if (prior && prior.source === 'story' && a.source === 'default') return;
  const row = { id, roomId: a.roomId, perspectiveId: a.perspectiveId, memoryId: a.memoryId, x: a.x, z: a.z, objectId: a.objectId, source: a.source, quote: a.quote.trim(), setBy: a.memberId, updatedAt: nowMs(ctx) };
  if (prior) ctx.db.perspectiveSpot.id.update(row); else ctx.db.perspectiveSpot.insert(row);
  if ([...ctx.db.perspectiveSpot.byRoom.filter(a.roomId)].length > 400) throw new SenderError('This visit has too many places.');
});
