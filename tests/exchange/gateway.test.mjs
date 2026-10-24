import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { backend, ref, waitFor, makeRoom, client } from './helpers.mjs';

test('real gateway: two-person handoff, private recipient, reload, idempotency and revocation', { timeout: 45000 }, async t => {
  const room = await makeRoom();
  const a = await client(room.owner); const b = await client(room.recipient); const outsider = await client(room.bystander);
  t.after(() => { a.close(); b.close(); outsider.close(); });
  const commandId = randomUUID();
  const pass = { type: 'pass', sourceId: room.sourceId, recipientId: room.recipientId, title: 'An afternoon together', commandId };
  await assert.rejects(b.send(pass), /own completed stories/);
  await assert.rejects(a.send({ ...pass, recipientId: 'not-a-member' }), /participant/);
  await a.send(pass); await a.send(pass);
  const received = await waitFor(() => b.snapshot()?.capsules.find(c => c.title === pass.title));
  assert.equal(received.status, 'pending'); assert.equal(b.snapshot().capsules.length, 1);
  assert.equal(outsider.snapshot().capsules.length, 0);
  await assert.rejects(outsider.send({ type: 'open', capsuleId: received.id }));
  await assert.rejects(b.send({ type: 'open', capsuleId: received.id }), /Accept/);
  await assert.rejects(b.send({ type: 'respond', capsuleId: received.id, revision: 99, status: 'accepted' }));
  await b.send({ type: 'respond', capsuleId: received.id, revision: 0, status: 'accepted' });
  await waitFor(() => b.snapshot().capsules[0]?.status === 'accepted');
  await b.send({ type: 'open', capsuleId: received.id });
  const opened = b.messages.findLast(m => m.type === 'opened');
  assert.match(opened.source.transcript, /fictional test story/); assert.equal(opened.source.audioUrl, null);
  const reopened = await client(room.recipient); t.after(() => reopened.close());
  assert.equal(reopened.snapshot().capsules[0].status, 'accepted');
  await a.send({ type: 'respond', capsuleId: received.id, revision: 1, status: 'revoked' });
  await waitFor(() => reopened.snapshot().capsules[0]?.status === 'revoked');
  await assert.rejects(reopened.send({ type: 'open', capsuleId: received.id }));
  await assert.rejects(b.send({ type: 'respond', capsuleId: received.id, revision: 2, status: 'accepted' }));
});

test('gateway rejects viewers, cross-room credentials and fixture archive calls', { timeout: 30000 }, async t => {
  const room = await makeRoom(); const a = await client(room.owner); t.after(() => a.close());
  await assert.rejects(a.send({ type: 'search', input: { place: 'San Francisco', yearFrom: 1900, yearTo: 1980 } }), /fixture-only/);
  const viewer = await backend.mutation(ref('rooms:join'), { code: room.owner.code, displayName: 'Spectator', role: 'viewer' });
  const v = await client(); t.after(() => v.close()); await assert.rejects(v.send({ type: 'join', ...viewer }));
  const other = await backend.mutation(ref('rooms:create'), { title: 'Other room', displayName: 'Other', offline: true });
  const x = await client(); t.after(() => x.close()); await assert.rejects(x.send({ type: 'join', code: other.code, token: room.owner.token }));
  await backend.mutation(ref('rooms:setPaused'), { ...room.owner, paused: true, commandId: randomUUID() });
  await assert.rejects(a.send({ type: 'pass', sourceId: room.sourceId, recipientId: room.recipientId, title: 'Paused', commandId: randomUUID() }), /paused/);
});
