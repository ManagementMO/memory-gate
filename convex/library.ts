// The object library as the phone sees it: names only (for the "Add an object" shortcuts), members only.
import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireMember } from './lib/auth';

export const list = query({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    await requireMember(ctx, code, token);
    const rows = await ctx.db.query('library').collect();
    return rows.map((r) => ({ key: r.key, source: r.source })).sort((a, b) => a.key.localeCompare(b.key));
  },
});
