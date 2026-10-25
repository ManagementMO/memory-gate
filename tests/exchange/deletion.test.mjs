import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DbConnection } from '../../services/exchange/bindings/index.ts';
import { backend, ref, makeRoom, client, waitFor } from './helpers.mjs';

test('room deletion erases handoffs and board records from real SpacetimeDB', { timeout: 25000 }, async t => {
  const room = await makeRoom(); const sender = await client(room.owner); t.after(() => sender.close());
  await assert.rejects(backend.query(ref('exchange:deletedRooms'), { secret: 'not-authorized', roomIds: [room.context.roomId] }));
  const token = process.env.SPACETIME_TOKEN ?? readFileSync('.spacetime/config/cli.toml', 'utf8').match(/^spacetimedb_token\s*=\s*"([^"]+)"/m)?.[1];
  let db;
  await new Promise((resolve, reject) => {
    db = DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName(process.env.SPACETIME_DATABASE ?? 'heirloom-exchange').withToken(token)
      .onConnect(c => c.subscriptionBuilder().onApplied(resolve).onError((_ctx, e) => reject(e)).subscribe(['SELECT * FROM capsule', 'SELECT * FROM reference']))
      .onConnectError((_ctx, e) => reject(e)).build();
  });
  t.after(() => db.disconnect());
  const commandId = randomUUID();
  await sender.send({ type: 'pass', sourceId: room.sourceId, recipientId: room.recipientId, title: 'Delete this synthetic memory', commandId });
  const capsuleId = `${room.context.roomId}:${commandId}`;
  await waitFor(() => db.db.capsule.id.find(capsuleId));
  const referenceId = randomUUID();
  await db.reducers.pinReference({ id: referenceId, roomId: room.context.roomId, memberId: room.context.memberId,
    data: JSON.stringify({ sourceUrl: 'https://www.loc.gov/item/test/', provenance: 'public-archive', title: 'Synthetic deletion test' }) });
  await backend.mutation(ref('consents:deleteMemory'), { ...room.owner, confirmText: room.owner.code });
  await waitFor(() => !db.db.capsule.id.find(capsuleId) && !db.db.reference.id.find(referenceId), 20000);
  assert.equal(db.db.capsule.id.find(capsuleId), null);
  assert.equal(db.db.reference.id.find(referenceId), null);
});
