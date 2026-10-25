import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

/** Seed updates and room deletion must preserve versions still referenced by another memory. */
export async function deleteIfUnreferenced(ctx: MutationCtx, id: Id<'_storage'>): Promise<void> {
  for (const table of ['library', 'assets', 'objects', 'splats', 'photos', 'utterances', 'memorySources', 'memoryObjects'] as const) {
    for (const row of await ctx.db.query(table).collect()) {
      const value = row as Record<string, unknown>;
      if (['fileId', 'liteFileId', 'previewFileId', 'glbFileId', 'storedGlbFileId', 'audioFileId'].some(key => value[key] === id)) return;
      if (table === 'assets' && ['liteFileId', 'previewFileId'].some(key => (value.meta as Record<string, unknown> | undefined)?.[key] === id)) return;
    }
  }
  await ctx.storage.delete(id).catch(() => {});
}
