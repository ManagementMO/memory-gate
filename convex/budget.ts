// A hard stop on model spend for this deployment. Each Claude call records its token usage at list prices; once
// the estimate reaches AI_BUDGET_USD (default $4.50) every caller falls back to the offline companion and planner.
// This is an estimate from response usage, not a provider invoice.
import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from './_generated/server';
import { readFlags, requireMember } from './lib/auth';

/** USD per million tokens (input, output, cache read, cache write), per the current Claude price list. */
const PRICES: Record<string, { in: number; out: number; read: number; write: number }> = {
  'claude-opus-5-5': { in: 4, out: 20, read: 0.2, write: 5 },
  'claude-sonnet-5-5': { in: 2, out: 10, read: 0.2, write: 2.5 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, read: 0.01, write: 0.125 },
};
export const budgetUsd = () => Number(process.env.AI_BUDGET_USD ?? 4.5);
export const priceOf = (model: string) => PRICES[model] ?? PRICES['claude-opus-5-5']!;

export const usageV = v.object({ input: v.number(), output: v.number(), cacheRead: v.number(), cacheWrite: v.number() });

/** Membership + the ai.live switch + remaining budget, in one read before any paid call. */
export const gate = internalQuery({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room } = await requireMember(ctx, code, token, ['storyteller', 'family']);
    const flags = await readFlags(ctx, room);
    const row = await ctx.db.query('spend').withIndex('by_key', (q) => q.eq('key', 'anthropic')).unique();
    const spent = row?.usd ?? 0;
    return { ok: flags['ai.live'] && !!process.env.ANTHROPIC_API_KEY && spent < budgetUsd(), roomId: room._id, spent, budget: budgetUsd() };
  },
});

export const record = internalMutation({
  args: { model: v.string(), usage: usageV },
  handler: async (ctx, { model, usage }) => {
    const p = priceOf(model);
    const usd = (usage.input * p.in + usage.output * p.out + usage.cacheRead * p.read + usage.cacheWrite * p.write) / 1e6;
    const row = await ctx.db.query('spend').withIndex('by_key', (q) => q.eq('key', 'anthropic')).unique();
    if (row) await ctx.db.patch(row._id, { usd: row.usd + usd, calls: row.calls + 1, inputTokens: row.inputTokens + usage.input + usage.cacheRead + usage.cacheWrite, outputTokens: row.outputTokens + usage.output, updatedAt: Date.now() });
    else await ctx.db.insert('spend', { key: 'anthropic', usd, calls: 1, inputTokens: usage.input + usage.cacheRead + usage.cacheWrite, outputTokens: usage.output, updatedAt: Date.now() });
  },
});

/** For the operator and the morning report: what has been spent so far. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query('spend').withIndex('by_key', (q) => q.eq('key', 'anthropic')).unique();
    return { usd: row?.usd ?? 0, calls: row?.calls ?? 0, inputTokens: row?.inputTokens ?? 0, outputTokens: row?.outputTokens ?? 0, budget: budgetUsd() };
  },
});
