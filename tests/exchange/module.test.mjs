import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DbConnection } from '../../services/exchange/bindings/index.ts';

test('real SpacetimeDB: private tables reject anonymous reads and direct reducer calls', { timeout: 15000 }, async t => {
  let connection;
  await new Promise((resolve, reject) => {
    connection = DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName(process.env.SPACETIME_DATABASE ?? 'heirloom-exchange').onConnect(resolve).onConnectError((_ctx, e) => reject(e)).build();
  });
  t.after(() => connection.disconnect());
  const denied = await new Promise(resolve => {
    connection.subscriptionBuilder().onApplied(() => resolve(false)).onError(() => resolve(true)).subscribe('SELECT * FROM capsule');
  });
  assert.equal(denied, true);
  await assert.rejects(connection.reducers.passMemory({ id: randomUUID(), roomId: 'attacker', sourceId: 'source', senderId: 'sender', recipientId: 'recipient', title: 'Unauthorized' }));
});

test('real SpacetimeDB: board is persistent and only its contributor can remove an item', { timeout: 15000 }, async t => {
  const token = process.env.SPACETIME_TOKEN ?? readFileSync('.spacetime/config/cli.toml', 'utf8').match(/^spacetimedb_token\s*=\s*"([^"]+)"/m)?.[1];
  let connection;
  await new Promise((resolve, reject) => {
    connection = DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName(process.env.SPACETIME_DATABASE ?? 'heirloom-exchange').withToken(token)
      .onConnect(c => c.subscriptionBuilder().onApplied(resolve).onError((_ctx, e) => reject(e)).subscribe('SELECT * FROM reference')).onConnectError((_ctx, e) => reject(e)).build();
  });
  t.after(() => connection.disconnect());
  const id = randomUUID(); const roomId = `test-${id}`;
  const data = JSON.stringify({ sourceUrl: 'https://www.loc.gov/item/test/', provenance: 'public-archive', title: 'Synthetic test reference; not a historical claim' });
  await connection.reducers.pinReference({ id, roomId, memberId: 'contributor', data });
  assert.ok(connection.db.reference.id.find(id));
  await assert.rejects(connection.reducers.unpinReference({ id, roomId, memberId: 'someone-else' }));
  await assert.rejects(connection.reducers.unpinReference({ id, roomId: 'another-room', memberId: 'contributor' }));
  await connection.reducers.unpinReference({ id, roomId, memberId: 'contributor' });
  assert.equal(connection.db.reference.id.find(id), null);
});
