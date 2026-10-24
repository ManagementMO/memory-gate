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
});
