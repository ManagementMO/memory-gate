import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import { newT, setupRoom } from './helpers';

test('a code-only viewer loses scene and transcript access when family sharing is withdrawn', async () => {
  const t = newT(); const r = await setupRoom(t, { scopes: ['voice_processing', 'voice_recording'] });
  const viewer = await t.mutation(api.rooms.join, { code: r.code, displayName: 'Audience', role: 'viewer' });
  const access = { code: r.code, token: viewer.token };
  for (const query of [api.rooms.get, api.objects.list, api.utterances.recent]) await expect(t.query(query, access)).rejects.toThrow(/sharing/i);
  const id = await t.mutation(api.consents.give, { code: r.code, token: r.owner, scopes: ['share_with_family'] });
  expect((await t.query(api.rooms.get, access)).me.role).toBe('viewer');
  expect(await t.query(api.objects.list, access)).toEqual([]);
  await t.mutation(api.consents.revoke, { code: r.code, token: r.owner, consentId: id });
  for (const query of [api.rooms.get, api.objects.list, api.utterances.recent]) await expect(t.query(query, access)).rejects.toThrow(/sharing/i);
  expect((await t.query(api.rooms.get, { code: r.code, token: r.owner })).me.isOwner).toBe(true);
});
