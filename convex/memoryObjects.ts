import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { activeScopes, readFlags, requireMember } from './lib/auth';
import { deleteMemoryObject } from './lib/memoryObjectFiles';
import { MEMORY_ASSETS, MEMORY_SLOTS, type MemoryAsset } from '../packages/shared/src/memoryObjects';
const auth = { code: v.string(), token: v.string() };
const perspective = v.union(v.literal('elena'), v.literal('rosa'));

export const list = query({ args: auth, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token), canAuthor = member.role === 'family';
  const flags = await readFlags(ctx, room);
  const objects = await ctx.db.query('memoryObjects').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  const places = await ctx.db.query('memoryPlaces').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  const library = canAuthor ? await ctx.db.query('library').collect() : [];
  return { canAuthor, generationEnabled: canAuthor && !room.offline && flags['objects.live'] && !!process.env.TRIPO_API_KEY && room.tripoCount < 3,
    places: places.filter(p => p.approved || canAuthor),
    library: library.map(l => ({ key: l.key, credit: l.credit })),
    objects: await Promise.all(objects.filter(o => o.status === 'placed' || canAuthor).map(async o => ({ ...o,
      url: o.fileId ? await ctx.storage.getUrl(o.fileId) : o.assetKey ? MEMORY_ASSETS[o.assetKey as MemoryAsset]?.url ?? null : null }))) };
} });

export const approvePlace = mutation({ args: { ...auth, id: v.id('memoryPlaces') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused || !(await activeScopes(ctx, room._id)).has('share_with_family')) throw new ConvexError('Continue with family sharing enabled before choosing a place.');
  const place = await ctx.db.get(a.id); if (!place || place.roomId !== room._id) throw new ConvexError('No such place.');
  await ctx.db.patch(place._id, { approved: true });
} });
export const removePlace = mutation({ args: { ...auth, id: v.id('memoryPlaces') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused) throw new ConvexError('Continue before removing a place.');
  const place = await ctx.db.get(a.id); if (!place || place.roomId !== room._id) throw new ConvexError('No such place.');
  const objects = await ctx.db.query('memoryObjects').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  for (const object of objects.filter(o => o.placeId === place._id)) await deleteMemoryObject(ctx, object);
  await ctx.db.delete(place._id);
} });

export const prepare = internalMutation({ args: { ...auth, sourceId: v.union(v.id('memorySources'), v.null()), placeId: v.union(v.id('memoryPlaces'), v.null()),
  perspective, choice: v.string(), label: v.string(), note: v.string(), vendorConsent: v.boolean(), commandId: v.string() }, handler: async (ctx, a) => {
  const { room, member } = await requireMember(ctx, a.code, a.token, ['family']);
  const prior = await ctx.db.query('memoryObjects').withIndex('by_room_command', q => q.eq('roomId', room._id).eq('commandId', a.commandId)).unique();
  if (prior) return { id: prior._id, created: false, needsGeneration: prior.choice === 'image' };
  if (room.paused) throw new ConvexError('Continue before preparing an object.');
  if (!a.label.trim() || a.label.length > 80 || a.note.length > 400 || !a.commandId || a.commandId.length > 80) throw new ConvexError('Use a short object name and a note of at most 400 characters.');
  const source = a.sourceId ? await ctx.db.get(a.sourceId) : null, place = a.placeId ? await ctx.db.get(a.placeId) : null;
  if ((!source && !place) || (a.sourceId && (!source || source.roomId !== room._id || !source.approved)) || (a.placeId && (!place || place.roomId !== room._id || !place.approved))) throw new ConvexError('Choose a reviewed source in this room first.');
  if (!(await activeScopes(ctx, room._id)).has('share_with_family')) throw new ConvexError('Enable family sharing before preparing a scene object.');
  const rows = await ctx.db.query('memoryObjects').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  if (rows.length >= 12 || rows.some(o => ['generating', 'downloading'].includes(o.status))) throw new ConvexError('Finish the current generation or remove an unused candidate before adding more.');
  let assetKey: MemoryAsset | null = null, fileId = null, modelSource = 'original-library', size = .9;
  const needsGeneration = a.choice === 'image';
  if (needsGeneration) {
    const flags = await readFlags(ctx, room);
    if (room.offline || !flags['objects.live'] || !process.env.TRIPO_API_KEY || room.tripoCount >= 3) throw new ConvexError('Live object generation is unavailable or this room has reached its three-submission limit. Choose a library model.');
    if (!a.vendorConsent || !source?.fileId || source.execution === 'fixture') throw new ConvexError('Choose an approved family photo and explicitly allow this photo to be sent to Tripo.');
    const file = await ctx.db.system.get(source.fileId);
    if (!file || file.size > 5_000_000 || (file.contentType !== undefined && !['image/jpeg', 'image/png', 'image/webp'].includes(file.contentType))) throw new ConvexError('Use a JPEG, PNG or WebP family photo smaller than 5 MB.');
    await ctx.db.patch(room._id, { tripoCount: room.tripoCount + 1 }); modelSource = 'tripo';
  } else if (a.choice.startsWith('builtin:')) {
    const key = a.choice.slice(8) as MemoryAsset;
    if (!Object.hasOwn(MEMORY_ASSETS, key)) throw new ConvexError('Unknown original asset.');
    assetKey = key; size = MEMORY_ASSETS[key].size;
  } else if (a.choice.startsWith('library:')) {
    const lib = await ctx.db.query('library').withIndex('by_key', q => q.eq('key', a.choice.slice(8))).unique();
    if (!lib) throw new ConvexError('That library object is unavailable.');
    fileId = lib.fileId; modelSource = 'existing-library'; size = Math.min(1.4, Math.max(.25, lib.size));
  } else throw new ConvexError('Choose an original/library model or image-to-3D.');
  const id = await ctx.db.insert('memoryObjects', { roomId: room._id, memberId: member._id, sourceId: a.sourceId, placeId: a.placeId,
    perspective: a.perspective, label: a.label.trim(), note: a.note.trim(), choice: a.choice, status: needsGeneration ? 'generating' : 'ready',
    assetKey, fileId, modelSource, taskId: null, vendorConsent: needsGeneration && a.vendorConsent, error: null, slot: null, size, yaw: 0, commandId: a.commandId, downloadLease: null, createdAt: Date.now() });
  return { id, created: true, needsGeneration };
} });

export const generationInfo = internalQuery({ args: { ...auth, id: v.id('memoryObjects') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  const object = await ctx.db.get(a.id); if (!object || object.roomId !== room._id) return null;
  const source = object.sourceId ? await ctx.db.get(object.sourceId) : null;
  return { object, imageFileId: source?.approved ? source.fileId : null, imageUrl: source?.approved && source.fileId ? await ctx.storage.getUrl(source.fileId) : null, paused: room.paused };
} });
export const saveTask = internalMutation({ args: { id: v.id('memoryObjects'), taskId: v.string() }, handler: async (ctx, a) => {
  const row = await ctx.db.get(a.id); if (row?.status === 'generating' && !row.taskId) await ctx.db.patch(row._id, { taskId: a.taskId });
} });
export const fail = internalMutation({ args: { id: v.id('memoryObjects'), message: v.string() }, handler: async (ctx, a) => {
  const row = await ctx.db.get(a.id); if (row && ['generating', 'downloading'].includes(row.status)) await ctx.db.patch(row._id, { status: 'failed', error: a.message.slice(0, 240), downloadLease: null });
} });
export const claimDownload = internalMutation({ args: { id: v.id('memoryObjects') }, handler: async (ctx, a) => {
  const object = await ctx.db.get(a.id); if (!object || !object.taskId || !['generating', 'downloading', 'failed'].includes(object.status)) return false;
  if (object.downloadLease && Date.now() - object.downloadLease < 45_000) return false;
  const room = await ctx.db.get(object.roomId), member = await ctx.db.get(object.memberId), source = object.sourceId ? await ctx.db.get(object.sourceId) : null;
  if (!room || room.paused || !member || member.revokedAt !== null || !source?.approved || !object.vendorConsent) return false;
  await ctx.db.patch(object._id, { status: 'downloading', downloadLease: Date.now() }); return true;
} });
export const finishModel = internalMutation({ args: { id: v.id('memoryObjects'), fileId: v.id('_storage') }, handler: async (ctx, a) => {
  const object = await ctx.db.get(a.id); if (!object || object.status !== 'downloading') return false;
  const room = await ctx.db.get(object.roomId), member = await ctx.db.get(object.memberId), source = object.sourceId ? await ctx.db.get(object.sourceId) : null;
  if (!room || room.paused || !member || member.revokedAt !== null || !source?.approved || !(await activeScopes(ctx, room._id)).has('share_with_family')) {
    await ctx.db.patch(object._id, { status: 'generating', downloadLease: null }); return false;
  }
  await ctx.db.patch(object._id, { fileId: a.fileId, status: 'ready', downloadLease: null, error: null }); return true;
} });
export const place = mutation({ args: { ...auth, id: v.id('memoryObjects') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused || !(await activeScopes(ctx, room._id)).has('share_with_family')) throw new ConvexError('Continue with family sharing enabled before placing an object.');
  const row = await ctx.db.get(a.id); if (!row || row.roomId !== room._id) throw new ConvexError('No such object.');
  if (row.status === 'placed') return;
  if (row.status !== 'ready') throw new ConvexError('Review a ready model before placing it.');
  const rows = await ctx.db.query('memoryObjects').withIndex('by_room', q => q.eq('roomId', room._id)).collect();
  const used = rows.filter(o => o.status === 'placed' && o.perspective === row.perspective).map(o => o.slot);
  const slot = MEMORY_SLOTS.findIndex((_, i) => !used.includes(i));
  if (slot < 0) throw new ConvexError('This perspective has three objects. Hide one before adding another.');
  await ctx.db.patch(row._id, { status: 'placed', slot });
} });
export const hide = mutation({ args: { ...auth, id: v.id('memoryObjects') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused) throw new ConvexError('Continue before changing an object.');
  const row = await ctx.db.get(a.id); if (!row || row.roomId !== room._id) throw new ConvexError('No such object.');
  if (row.status === 'placed') await ctx.db.patch(row._id, { status: 'ready', slot: null });
} });
export const remove = mutation({ args: { ...auth, id: v.id('memoryObjects') }, handler: async (ctx, a) => {
  const { room } = await requireMember(ctx, a.code, a.token, ['family']);
  if (room.paused) throw new ConvexError('Continue before removing an object.');
  const row = await ctx.db.get(a.id); if (!row || row.roomId !== room._id) throw new ConvexError('No such object.');
  await deleteMemoryObject(ctx, row);
} });
