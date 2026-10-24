// Setup API for the seed script and the local worker (WORKER_SECRET-guarded; never exposed to the apps).
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { FLAG_NAMES } from '../packages/shared/src/flags';
import { deleteIfUnreferenced } from './lib/storage';

function checkSecret(secret: string) {
  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError({ code: 'FORBIDDEN', message: 'bad secret' });
}

export const uploadUrl = mutation({ args: { secret: v.string() }, handler: async (ctx, { secret }) => { checkSecret(secret); return ctx.storage.generateUploadUrl(); } });

export const upsertLibrary = mutation({
  args: { secret: v.string(), key: v.string(), synonyms: v.array(v.string()), fileId: v.id('_storage'), size: v.number(), yawOffset: v.number(), source: v.string(), credit: v.string() },
  handler: async (ctx, { secret, ...row }) => {
    checkSecret(secret);
    const old = await ctx.db.query('library').withIndex('by_key', (q) => q.eq('key', row.key)).unique();
    if (old) { await ctx.db.patch(old._id, row); if (old.fileId !== row.fileId) await deleteIfUnreferenced(ctx, old.fileId); }
    else await ctx.db.insert('library', row);
  },
});

export const upsertAsset = mutation({
  args: { secret: v.string(), key: v.string(), fileId: v.id('_storage'), meta: v.optional(v.any()) },
  handler: async (ctx, { secret, key, fileId, meta }) => {
    checkSecret(secret);
    const old = await ctx.db.query('assets').withIndex('by_key', (q) => q.eq('key', key)).unique();
    if (old) { await ctx.db.patch(old._id, { fileId, meta }); if (old.fileId !== fileId) await deleteIfUnreferenced(ctx, old.fileId); }
    else await ctx.db.insert('assets', { key, fileId, meta });
  },
});

export const setFlags = mutation({
  args: { secret: v.string(), values: v.record(v.string(), v.boolean()) },
  handler: async (ctx, { secret, values }) => {
    checkSecret(secret);
    for (const [name, value] of Object.entries(values)) {
      if (!(FLAG_NAMES as readonly string[]).includes(name)) continue;
      const row = await ctx.db.query('flags').withIndex('by_name', (q) => q.eq('name', name)).unique();
      if (row) await ctx.db.patch(row._id, { value }); else await ctx.db.insert('flags', { name, value });
    }
  },
});

export const status = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    checkSecret(secret);
    return {
      library: (await ctx.db.query('library').collect()).map((l) => ({ key: l.key, size: l.size, source: l.source })),
      assets: (await ctx.db.query('assets').collect()).map((a) => a.key),
      flags: (await ctx.db.query('flags').collect()).map((f) => `${f.name}=${f.value}`),
      rooms: (await ctx.db.query('rooms').collect()).length,
      worldGenerationUsage: (await ctx.db.query('providerUsage').withIndex('by_key', q => q.eq('key', 'worldlabs.generations')).unique())?.count ?? null,
      worldGenerationLimit: Number(process.env.WORLD_LABS_GENERATION_LIMIT ?? 3),
    };
  },
});
