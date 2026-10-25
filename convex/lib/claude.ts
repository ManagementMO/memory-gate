// One Claude client for the experience's actions (imported only by 'use node' files). Structured output via the
// SDK's zod helper, the system prompt cached, refusals routed to the server-side default fallback, and every call's
// usage recorded against the deployment budget. Callers always have an offline fallback; null means "use it".
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import type { ActionCtx } from '../_generated/server';
import { internal } from '../_generated/api';

let client: Anthropic | null = null;
export function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 1,
    timeout: 25_000,
    ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
  });
  return client;
}

/** The model for the experience. Claude Opus 5.5 by default; GATE_MODEL can choose another (e.g. to trade cost). */
export const gateModel = () => process.env.GATE_MODEL || 'claude-opus-5-5';
/** The companion's conversational turns, where every second of silence is felt: Claude Sonnet 5.5 answers in about
 *  a second with the same short, warm replies (GUIDE_MODEL overrides). Scene planning stays on gateModel(). */
export const guideModel = () => process.env.GUIDE_MODEL || 'claude-sonnet-5-5';

type Content = Anthropic.Beta.BetaContentBlockParam[] | string;

export async function structured<S extends z.ZodType>(
  ctx: ActionCtx,
  opts: { system: string; content: Content; schema: S; maxTokens?: number; effort?: 'low' | 'medium' | 'high'; model?: string },
): Promise<z.infer<S> | null> {
  const c = anthropic();
  if (!c) return null;
  const model = opts.model ?? gateModel();
  try {
    const res = await c.beta.messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      system: opts.system,
      output_config: { effort: opts.effort ?? 'low', format: betaZodOutputFormat(opts.schema) },
      messages: [{ role: 'user', content: opts.content }],
    });
    const u = res.usage as unknown as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
    await ctx.runMutation(internal.budget.record, {
      model: res.model || model,
      usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      console.warn(`[claude] ${res.stop_reason}; using the offline path`);
      return null;
    }
    return (res.parsed_output ?? null) as z.infer<S> | null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn('[claude] rate limited; offline path');
    else if (e instanceof Anthropic.APIError) console.warn(`[claude] API error ${e.status}: ${String(e.message).slice(0, 160)}`);
    else console.warn('[claude] failed:', String((e as Error)?.message ?? e).slice(0, 160));
    return null;
  }
}

/** A stored image as a Claude image block (downscaled on upload by the client; capped here). */
export async function imageBlock(url: string): Promise<Anthropic.Beta.BetaImageBlockParam | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') ?? 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > 4_500_000) return null;
    const media = /png/.test(type) ? 'image/png' : /webp/.test(type) ? 'image/webp' : /gif/.test(type) ? 'image/gif' : 'image/jpeg';
    return { type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } };
  } catch {
    return null;
  }
}
