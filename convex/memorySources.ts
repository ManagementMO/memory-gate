import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { activeScopes, requireMember } from './lib/auth';
import { deleteIfUnreferenced } from './lib/storage';
import { postUrls, mediaUrl } from '../actors/historical-memory-atlas/src/social.mjs';
import { placeQuery, mapsUrl } from '../actors/historical-memory-atlas/src/places.mjs';
import { deleteMemoryObject } from './lib/memoryObjectFiles';

const auth = { code: v.string(), token: v.string() };
const objectKey = v.union(v.literal('kite'), v.literal('flower'), v.literal('landmark'));
const perspective = v.union(v.literal('elena'), v.literal('rosa'));
const card = v.object({ sourceUrl: v.string(), imageUrl: v.string(), caption: v.string(), owner: v.string(), timestamp: v.union(v.string(), v.null()), suggestedObjects: v.array(v.string()), attribution: v.string() });

export const list = query({ args: auth, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token);
  const canAuthor = member.role === 'family';
  const rows = await ctx.db.query('memorySources').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  const jobs = canAuthor ? await ctx.db.query('memoryImports').withIndex('by_room', q => q.eq('roomId', room._id)).collect() : [];
  return { canAuthor, offline: !!room.offline,
    configured: !!process.env.APIFY_TOKEN && process.env.ALLOW_APIFY_CLOUD === '1',
    jobs: jobs.slice(-10).map(j => ({ _id: j._id, status: j.status, runId: j.runId, mode: j.mode, error: j.error, kind: j.kind ?? 'social' })),
    sources: await Promise.all(rows.filter(r => r.approved || canAuthor).map(async r => ({ ...r, imageUrl: r.fileId ? await ctx.storage.getUrl(r.fileId) : r.imageUrl }))) };
} });

export const begin = internalMutation({ args: { ...auth, mode: v.union(v.literal('fixture'), v.literal('cloud')), urls: v.array(v.string()), permission: v.boolean(), actorId: v.string(), kind: v.optional(v.literal('place')), queryText: v.optional(v.string()) }, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused) throw new ConvexError('Continue the room before importing.');
  if (!a.permission) throw new ConvexError('Confirm permission to use and share these photos.');
  if (a.mode === 'cloud' && room.offline) throw new ConvexError('This is an offline sample. Open a live import copy to use Apify.');
  if (a.mode === 'fixture' && !room.demo) throw new ConvexError('Fictional sources are available only in sample rooms.');
  const urls = a.mode === 'cloud' && !a.kind ? postUrls(a.urls) : [];
  const jobs = await ctx.db.query('memoryImports').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  if (a.kind && (await ctx.db.query('memoryPlaces').withIndex('by_room', q => q.eq('roomId', room._id)).collect()).length >= 12) throw new ConvexError('Remove an unused place before adding another.');
  if (jobs.some(j => j.status === 'running')) throw new ConvexError('An import is already running. Check that run before starting another.');
  if (a.mode === 'cloud' && jobs.some(j => j.mode === 'cloud' && Date.now() - j.createdAt < 60_000)) throw new ConvexError('Please wait a minute before starting another Apify run.');
  const sources = await ctx.db.query('memorySources').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  if (sources.length >= 32 || jobs.length >= 40) throw new ConvexError('Remove unused sources or start a new source workspace before importing more.');
  return ctx.db.insert('memoryImports', { roomId: room._id, memberId: member._id, mode: a.mode, urls, actorId: a.actorId, status: 'running', runId: null, error: null, createdAt: Date.now(), ...(a.kind ? { kind: a.kind, queryText: placeQuery(a.queryText) } : {}) });
} });

const placeCard = v.object({ title: v.string(), sourceUrl: v.string(), address: v.string(), lat: v.union(v.number(), v.null()), lng: v.union(v.number(), v.null()) });
export const completePlaces = internalMutation({ args: { id: v.id('memoryImports'), places: v.array(placeCard) }, handler: async (ctx, a) => {
  const job = await ctx.db.get(a.id); if (!job || job.status !== 'running' || job.kind !== 'place') return;
  const member = await ctx.db.get(job.memberId), room = await ctx.db.get(job.roomId);
  if (!room || !member || member.revokedAt !== null || member.role !== 'family') { await ctx.db.patch(job._id, { status: 'failed', error: 'Import permission ended.' }); return; }
  const existing = await ctx.db.query('memoryPlaces').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  let count = 0;
  for (const p of a.places.slice(0, Math.min(3, Math.max(0, 12 - existing.length)))) {
    if (!mapsUrl(p.sourceUrl)) continue;
    await ctx.db.insert('memoryPlaces', { ...p, title: p.title.slice(0, 120), address: p.address.slice(0, 220), roomId: room._id, importId: job._id, approved: false, execution: 'apify-cloud', runId: job.runId, createdAt: Date.now() }); count++;
  }
  await ctx.db.patch(job._id, { status: 'ready', error: count ? null : 'No supported place references returned, or the room already has 12 places.' });
} });
export const fixturePlace = internalMutation({ args: { id: v.id('memoryImports') }, handler: async (ctx, a) => {
  const job = await ctx.db.get(a.id); if (!job || job.status !== 'running' || job.kind !== 'place' || job.mode !== 'fixture') return;
  const room = await ctx.db.get(job.roomId), member = await ctx.db.get(job.memberId);
  if (!room || !member || member.revokedAt !== null) return;
  const places = await ctx.db.query('memoryPlaces').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  if (places.length >= 12) throw new ConvexError('Remove an unused place before adding another.');
  await ctx.db.insert('memoryPlaces', { roomId: room._id, importId: job._id, title: 'Willowbrook Park · fictional example', address: 'A small park with an arched wooden footbridge. Invented for this example.', sourceUrl: null, lat: null, lng: null, approved: false, execution: 'fixture', runId: null, createdAt: Date.now() });
  await ctx.db.patch(job._id, { status: 'ready' });
} });

export const job = internalQuery({ args: { ...auth, id: v.id('memoryImports') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  const row = await ctx.db.get(a.id);
  if (!row || row.roomId !== room._id) throw new ConvexError('No such import.');
  return row;
} });
export const recordRun = internalMutation({ args: { id: v.id('memoryImports'), runId: v.string() }, handler: async (ctx, a) => {
  const row = await ctx.db.get(a.id);
  if (row?.status === 'running') await ctx.db.patch(a.id, { runId: a.runId });
} });
export const fail = internalMutation({ args: { id: v.id('memoryImports'), message: v.string() }, handler: async (ctx, a) => {
  const row = await ctx.db.get(a.id);
  if (row?.status === 'running') await ctx.db.patch(a.id, { status: 'failed', error: a.message.slice(0, 250) });
} });
export const complete = internalMutation({ args: { id: v.id('memoryImports'), cards: v.array(card) }, handler: async (ctx, a) => {
  const job = await ctx.db.get(a.id); if (!job || job.status !== 'running') return;
  const member = await ctx.db.get(job.memberId), room = await ctx.db.get(job.roomId);
  if (!room || !member || member.revokedAt !== null || member.role !== 'family') { await ctx.db.patch(job._id, { status: 'failed', error: 'Import permission ended. No photos were added.' }); return; }
  for (const c of a.cards.slice(0, 8)) {
    if (!job.urls.includes(c.sourceUrl) || !mediaUrl(c.imageUrl)) continue;
    await ctx.db.insert('memorySources', { roomId: room._id, importId: job._id, approved: false, sourceUrl: c.sourceUrl,
      imageUrl: c.imageUrl, fileId: null, caption: c.caption.slice(0, 2200), owner: c.owner.slice(0, 80), timestamp: c.timestamp,
      suggestedObjects: c.suggestedObjects, objectKey: 'kite', perspective: 'elena', note: '', execution: 'apify-cloud', runId: job.runId, createdAt: Date.now() });
  }
  await ctx.db.patch(job._id, { status: 'ready', error: a.cards.length ? null : 'No supported public photos were returned. Private posts, videos and unavailable posts cannot be imported.' });
} });
export const fixture = internalMutation({ args: { id: v.id('memoryImports') }, handler: async (ctx, a) => {
  const job = await ctx.db.get(a.id); if (!job || job.status !== 'running' || job.mode !== 'fixture') return;
  const member = await ctx.db.get(job.memberId), room = await ctx.db.get(job.roomId);
  if (!room || !member || member.revokedAt !== null) return;
  await ctx.db.insert('memorySources', { roomId: room._id, importId: job._id, approved: false, sourceUrl: null,
    imageUrl: '/red-kite/memory-source.svg', fileId: null, caption: 'A kite above the meadow, with a cream ribbon on its tail. Fictional family-album example.',
    owner: 'Fictional family album', timestamp: null, suggestedObjects: ['kite'], objectKey: 'kite', perspective: 'elena',
    note: '', execution: 'fixture', runId: null, createdAt: Date.now() });
  await ctx.db.patch(job._id, { status: 'ready' });
} });

export const source = internalQuery({ args: { ...auth, id: v.id('memorySources') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused) throw new ConvexError('Continue the room before changing a source.');
  const row = await ctx.db.get(a.id);
  if (!row || row.roomId !== room._id) throw new ConvexError('No such source.');
  if (!(await activeScopes(ctx, room._id)).has('share_with_family')) throw new ConvexError('Enable family sharing before attaching a source.');
  return row;
} });
export const publish = internalMutation({ args: { ...auth, id: v.id('memorySources'), fileId: v.union(v.id('_storage'), v.null()), objectKey, perspective, note: v.string() }, handler: async (ctx, a) => {
  // Recheck after the network download: a revoked member cannot publish a late image.
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused || !(await activeScopes(ctx, room._id)).has('share_with_family')) throw new ConvexError('Continue with sharing enabled before attaching.');
  const row = await ctx.db.get(a.id);
  if (!row || row.roomId !== room._id) throw new ConvexError('This source has been removed.');
  if (row.approved) return { usedFile: false };
  if (row.execution !== 'fixture' && !a.fileId) throw new ConvexError('The photo must be cached before attaching it.');
  await ctx.db.patch(a.id, { approved: true, fileId: a.fileId, imageUrl: row.execution === 'fixture' ? row.imageUrl : null, objectKey: a.objectKey, perspective: a.perspective, note: a.note.trim().slice(0, 400) });
  return { usedFile: true };
} });
export const remove = mutation({ args: { ...auth, id: v.id('memorySources') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused) throw new ConvexError('Continue before removing a source.');
  const row = await ctx.db.get(a.id);
  if (!row || row.roomId !== room._id) throw new ConvexError('No such source.');
  const objects = await ctx.db.query('memoryObjects').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  for (const object of objects.filter(o => o.sourceId === row._id)) await deleteMemoryObject(ctx, object);
  await ctx.db.delete(row._id);
  if (row.fileId) await deleteIfUnreferenced(ctx, row.fileId);
} });
