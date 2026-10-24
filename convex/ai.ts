'use node';
// Extraction: Claude Sonnet 5.5 fills the Extraction schema with structured outputs (V7: 32/32 intent and object
// accuracy, 0 forbidden actions on the adversarial fixtures). The validator decides what survives. With ai.live off,
// or on any provider failure, the deterministic keyword mock runs instead and the utterance is marked "mock".
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { v } from 'convex/values';
import { internalAction, type ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { Extraction, SYSTEM_PROMPT, mockExtract, safeDisplay, validate, type ExtractionResult } from '../packages/shared/src/contract';
import { repairMojibake } from '../packages/shared/src/text';

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 1,
    timeout: 12_000,
    ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
  });
  return client;
}

export async function liveExtract(transcript: string, pending: string | null, inRoom: string[]): Promise<ExtractionResult> {
  const c = anthropic();
  if (!c) throw new Error('no ANTHROPIC_API_KEY');
  const res = await c.messages.parse({
    model: process.env.AI_MODEL || 'claude-sonnet-5-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    thinking: { type: 'between_tools' },
    messages: [{ role: 'user', content: `Pending ghost object: ${pending ?? 'none'}\nAlready in the room: ${inRoom.join(', ') || 'nothing yet'}\n<transcript>${transcript}</transcript>` }],
    output_config: { effort: 'low', format: zodOutputFormat(Extraction) },
  } as Parameters<typeof c.messages.parse>[0]);
  const out = (res as unknown as { parsed_output: ExtractionResult | null }).parsed_output;
  if (!out) throw new Error(`no parsed output (stop_reason ${(res as { stop_reason?: string }).stop_reason})`);
  return out;
}

export const extract = internalAction({
  args: { utteranceId: v.id('utterances') },
  handler: async (ctx, { utteranceId }) => {
    try { await extractOne(ctx, utteranceId); }
    catch (e) { await ctx.runMutation(internal.utterances.failExtraction, { utteranceId, error: `extraction failed: ${String((e as Error).message ?? e)}` }); }
  },
});

async function extractOne(ctx: ActionCtx, utteranceId: Id<'utterances'>) {
  {
    if (await ctx.runMutation(internal.corrections.fromUtterance, { utteranceId })) return;
    const input = await ctx.runQuery(internal.utterances.forExtraction, { utteranceId });
    if (!input) return;
    const t0 = Date.now();
    let out: ExtractionResult;
    let mode = 'mock';
    const dropped: string[] = [];
    if (input.flags['ai.live'] && anthropic()) {
      try { out = await liveExtract(input.transcript, input.pending, input.inRoom); mode = 'live'; }
      catch (e) {
        dropped.push(`live AI failed, used the mock: ${String((e as Error).message).slice(0, 120)}`);
        out = mockExtract(input.transcript, input.libraryKeys); mode = 'mock-fallback';
      }
    } else out = mockExtract(input.transcript, input.libraryKeys);
    // Some live Spanish replies arrive as UTF-8 shown as Windows-1250 ("ÂżQuĂ©"); repair display text before use.
    out = { ...out, companion_reply: repairMojibake(out.companion_reply), reply_translation: repairMojibake(out.reply_translation ?? ''), translation: repairMojibake(out.translation) };
    const val = validate(input.transcript, out);
    await ctx.runMutation(internal.objects.applyActions, {
      utteranceId, actions: val.actions, reply: val.reply, replyTranslation: val.replyTranslation, aiMode: mode, aiMs: Date.now() - t0, dropped: [...dropped, ...val.dropped],
      language: /^[a-z]{2}$/.test(out.language) ? out.language : null,
      translation: val.translation || null,
    });
  }
}

/** Open the HTTPS connection to Anthropic before the first real turn (a free models GET); the first call in a fresh
 * process otherwise takes ~5 s (V7, practice smoke). Scheduled by rooms.heartbeat when a headset (re)appears. */
export const warm = internalAction({
  args: {},
  handler: async () => {
    const c = anthropic();
    if (!c) return;
    try { await c.models.retrieve(process.env.AI_MODEL || 'claude-sonnet-5-5'); } catch { /* warming is best effort */ }
  },
});
