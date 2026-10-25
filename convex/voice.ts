// Cartesia access tokens for the headset (keys never reach a browser). Minted only for room members, with
// voice_processing consent, while the room is not paused, for a short time; family names become STT keyterms.
import { ConvexError, v } from 'convex/values';
import { action, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { activeScopes, readFlags, requireMember } from './lib/auth';
import { clipsAllowed } from './voiceGuard';
import type { Flags } from '../packages/shared/src/flags';

type VoiceCheck = { paused: boolean; consent: boolean; recording: boolean; flags: Flags; keyterms: string[] };
export type MintResult = { voiceId: string; ttsModel: string; cartesiaVersion: string; keyterms: string[]; recording: boolean; sttLive: boolean; ttsLive: boolean; token: string | null; expiresAt: number | null };

export const VOICE_ID = 'ea93f57f-7c71-4d79-aeaa-0a39b150f6ca'; // "Diana": warm, mature, casual (research/cartesia-voices.md)
export const TTS_MODEL = 'sonic-3.6-2026-08-27';
export const CARTESIA_VERSION = '2026-08-14';

export const check = internalQuery({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }) => {
    const { room, member } = await requireMember(ctx, code, token, ['storyteller', 'family']);
    const scopes = await activeScopes(ctx, room._id);
    // Recording also needs a guardian's yes when this person sees through the grandchild's eyes (voiceGuard.ts).
    return { paused: room.paused, consent: scopes.has('voice_processing'), recording: await clipsAllowed(ctx, room._id, member._id), flags: await readFlags(ctx, room), keyterms: room.familyNames };
  },
});

export const mintToken = action({
  args: { code: v.string(), token: v.string() },
  handler: async (ctx, { code, token }): Promise<MintResult> => {
    const c: VoiceCheck = await ctx.runQuery(internal.voice.check, { code, token });
    if (c.paused) throw new ConvexError({ code: 'PAUSED', message: 'The memory is paused. Resume it before enabling voice.' });
    if (!c.consent) throw new ConvexError({ code: 'NO_CONSENT', message: 'Voice needs the voice_processing consent on the phone.' });
    const base: Omit<MintResult, 'token' | 'expiresAt'> = { voiceId: VOICE_ID, ttsModel: TTS_MODEL, cartesiaVersion: CARTESIA_VERSION, keyterms: c.keyterms, recording: c.recording, sttLive: c.flags['stt.live'], ttsLive: c.flags['tts.live'] };
    if (!c.flags['stt.live'] && !c.flags['tts.live']) return { ...base, token: null, expiresAt: null };
    const key = process.env.CARTESIA_API_KEY;
    if (!key) throw new ConvexError({ code: 'NO_KEY', message: 'Voice provider is not configured.' });
    const r = await fetch('https://api.cartesia.ai/access-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Cartesia-Version': CARTESIA_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grants: { stt: c.flags['stt.live'], tts: c.flags['tts.live'] }, expires_in: 600 }),
    });
    if (!r.ok) throw new ConvexError({ code: 'PROVIDER', message: `Voice token failed (${r.status}).` });
    const body = (await r.json()) as { token?: string };
    if (!body.token) throw new ConvexError({ code: 'PROVIDER', message: 'Voice token missing.' });
    return { ...base, token: body.token, expiresAt: Date.now() + 600_000 };
  },
});
