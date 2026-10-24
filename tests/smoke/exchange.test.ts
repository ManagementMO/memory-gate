import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api';
import { newT, setupRoom, storeBlob } from './helpers';

test('exchange excludes spectators and requires current sharing consent', async () => {
  const t = newT(); const r = await setupRoom(t);
  const context = await t.query(api.exchange.context, { code: r.code, token: r.owner });
  expect(context.members).toHaveLength(2);
  expect(JSON.stringify(context)).not.toContain(r.owner);
  const viewer = await t.mutation(api.rooms.join, { code: r.code, displayName: 'Audience', role: 'viewer' });
  await expect(t.query(api.exchange.context, viewer)).rejects.toThrow();
  const other = await setupRoom(t, { sample: false, library: false });
  await expect(t.query(api.exchange.context, { code: other.code, token: r.owner })).rejects.toThrow();
  const off = await setupRoom(t, { scopes: [], sample: false, library: false });
  await expect(t.query(api.exchange.context, { code: off.code, token: off.owner })).rejects.toThrow();
});
test('source lookup rejects cross-room IDs and never serves revoked recordings', async () => {
  const t = newT(); const r = await setupRoom(t);
  const member = await t.query(api.exchange.context, { code: r.code, token: r.owner });
  const audioFileId = await storeBlob(t, 'synthetic audio', 'audio/wav');
  const sourceId = await t.run(ctx => ctx.db.insert('utterances', {
    roomId: member.roomId, memberId: member.memberId, speaker: 'Test contributor', transcript: 'A test memory.',
    audioFileId, source: 'fixture', language: 'en', translation: null, pointer: null, durationMs: 0, status: 'done', intent: null,
    reply: null, sayBack: null, aiMode: null, aiMs: null, dropped: [], commandId: 'test-exchange-source', createdAt: Date.now(),
  }));
  const source = await t.query(api.exchange.source, { code: r.code, token: r.teller, sourceId });
  expect(source.audioUrl).toBeNull(); expect(source.transcript).toBe('A test memory.');
  const recordingConsent = await t.mutation(api.consents.give, { code: r.code, token: r.owner, scopes: ['voice_recording'] });
  expect((await t.query(api.exchange.source, { code: r.code, token: r.teller, sourceId })).audioUrl).toBeTruthy();
  await t.mutation(api.consents.revoke, { code: r.code, token: r.owner, consentId: recordingConsent });
  expect((await t.query(api.exchange.source, { code: r.code, token: r.teller, sourceId })).audioUrl).toBeNull();
  expect((await t.query(api.exchange.context, { code: r.code, token: r.teller })).recordingAllowed).toBe(false);
  const other = await setupRoom(t, { sample: false, library: false });
  await expect(t.query(api.exchange.source, { code: other.code, token: other.owner, sourceId })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(member.memberId, { revokedAt: Date.now() }));
  await expect(t.query(api.exchange.source, { code: r.code, token: r.teller, sourceId })).rejects.toThrow();
});
