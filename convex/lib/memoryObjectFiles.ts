import type { MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { deleteIfUnreferenced } from './storage';
export async function deleteMemoryObject(ctx: MutationCtx, object: Doc<'memoryObjects'>) {
  await ctx.db.delete(object._id);
  if (object.fileId) await deleteIfUnreferenced(ctx, object.fileId);
}
