'use node';
import { ConvexError, v } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
export const photo = action({ args: { code: v.string(), token: v.string(), bytes: v.bytes(), caption: v.string(), permission: v.boolean(), commandId: v.string() }, handler: async (ctx, a): Promise<void> => {
  if (!a.permission || !a.commandId || a.commandId.length > 80 || a.caption.length > 2200) throw new ConvexError('Confirm permission and use a short caption.');
  const bytes = new Uint8Array(a.bytes);
  if (bytes.byteLength < 32 || bytes.byteLength > 600_000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new ConvexError('Choose a supported photo; it will be resized for the memory.');
  await ctx.runQuery(internal.memorySources.uploadGate, { code: a.code, token: a.token });
  const fileId = await ctx.storage.store(new Blob([a.bytes], { type: 'image/jpeg' }));
  try { const result = await ctx.runMutation(internal.memorySources.saveUpload, { code: a.code, token: a.token, fileId, caption: a.caption, commandId: a.commandId }); if (!result.usedFile) await ctx.storage.delete(fileId); }
  catch { await ctx.storage.delete(fileId); throw new ConvexError('The photo was not saved. Check membership, room state and the source limit.'); }
} });
