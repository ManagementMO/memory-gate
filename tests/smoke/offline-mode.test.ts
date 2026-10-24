import { afterEach, expect, test, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import { newT, drain } from './helpers';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('an offline room cannot spend provider quota even when every deployment service is on', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValue(new Error('Offline verification must not reach a provider.'));
  vi.stubGlobal('fetch', fetch); vi.stubEnv('ANTHROPIC_API_KEY', 'test-only-key');
  const t = newT();
  await t.run(async ctx => {
    for (const name of ['ai.live', 'stt.live', 'tts.live', 'splat.live', 'objects.live', 'worldlabs.generate']) await ctx.db.insert('flags', { name, value: true });
  });
  const room = await t.mutation(api.rooms.create, { title: 'Offline verification', displayName: 'Test operator', offline: true });
  await t.mutation(api.consents.give, { ...room, scopes: ['voice_processing', 'photo_processing', 'vendor_upload_worldlabs'] });
  const view = await t.query(api.rooms.get, room);
  expect(view.room.offline).toBe(true);
  for (const name of ['ai.live', 'stt.live', 'tts.live', 'splat.live', 'objects.live', 'worldlabs.generate']) expect(view.flags[name as keyof typeof view.flags]).toBe(false);
  expect(await t.action(api.voice.mintToken, room)).toMatchObject({ sttLive: false, ttsLive: false, token: null });
  await t.mutation(api.utterances.add, { ...room, transcript: 'There was a piano by the window.', source: 'typed', commandId: 'offline-turn' });
  await drain(t);
  expect((await t.query(api.utterances.recent, room))[0]).toMatchObject({ aiMode: 'mock', status: 'done' });
  expect(fetch).not.toHaveBeenCalled();
});
