// Perspectives through the real gateway and SpacetimeDB (needs `npm run local:up`): two perspectives per visit,
// poses and pushes scoped to the room, claims, attributed stories and things, handing a memory across, and erasure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DbConnection } from '../../services/exchange/bindings/index.ts';
import { backend, ref, makeRoom, client, waitFor } from './helpers.mjs';

const social = (c) => c.messages.findLast(m => m.type === 'social')?.social;
const poses = (c) => c.messages.findLast(m => m.type === 'poses')?.poses ?? [];
const pose = (c, perspectiveId, y) => c.socket.send(JSON.stringify({ type: 'pose', perspectiveId, device: 'phone', inScene: true, head: [0.5, y, -1, 0, 0, 0, 1], left: [], right: [] }));
const placement = { x: 0.4, y: 0, z: 0.6, yaw: 0, scale: 1, on: null };

test('perspectives: room-scoped poses, claims, attributed stories, things and a memory handed across', { timeout: 60000 }, async t => {
  const room = await makeRoom();
  const host = await client(room.owner); const sam = await client(room.recipient); const taylor = await client(room.bystander);
  const elsewhere = await makeRoom(); const stranger = await client(elsewhere.owner);
  t.after(() => { host.close(); sam.close(); taylor.close(); stranger.close(); });

  const first = await waitFor(() => social(host)?.perspectives.length === 2 && social(host));
  const grandparent = first.perspectives.find(p => p.key === 'grandparent');
  const child = first.perspectives.find(p => p.key === 'child');
  assert.equal(grandparent.eyeHeight.toFixed(1), '1.6'); assert.equal(child.eyeHeight.toFixed(1), '1.1');
  const theirs = await waitFor(() => social(stranger)?.perspectives.length === 2 && social(stranger));
  assert.ok(!theirs.perspectives.some(p => p.id === child.id), 'another visit never sees these perspectives');

  // Heads and hands reach the room, never another visit; malformed poses are dropped.
  pose(sam, child.id, 1.1);
  const samPose = await waitFor(() => poses(host).find(p => p.memberId === room.recipientId));
  assert.equal(samPose.perspectiveId, child.id); assert.ok(Math.abs(samPose.head[1] - 1.1) < 1e-3);
  sam.socket.send(JSON.stringify({ type: 'pose', perspectiveId: child.id, device: 'phone', inScene: true, head: [0, 'x', 0], left: [], right: [] }));
  await new Promise(r => setTimeout(r, 400));
  assert.ok(Math.abs(poses(host).find(p => p.memberId === room.recipientId).head[1] - 1.1) < 1e-3);
  assert.ok(!poses(stranger).some(p => p.memberId === room.recipientId));

  // One claim per perspective (the host may reassign); a claim carries the claimant's current name.
  await backend.mutation(ref('rooms:rename'), { ...room.recipient, displayName: 'Lily' });
  await sam.send({ type: 'claim', perspectiveId: child.id, claim: true });
  await waitFor(() => social(host).perspectives.find(p => p.id === child.id).claimedName === 'Lily');
  await assert.rejects(taylor.send({ type: 'claim', perspectiveId: child.id, claim: true }), /already seeing/);

  // A story told through the grandchild's eyes is the grandchild's, spoken by whoever said it; its thing too.
  const commandId = randomUUID();
  await sam.send({ type: 'story', commandId, perspectiveId: child.id, memoryId: 't:Kitchen', kind: 'note', text: 'There was a little stool by the stove. A fictional test memory.' });
  const storyId = `${room.context.roomId}:${commandId}`;
  const told = await waitFor(() => social(host).stories.find(s => s.id === storyId));
  assert.equal(told.speakerName, 'Lily'); assert.equal(told.perspectiveId, child.id);
  await sam.send({ type: 'story', commandId, perspectiveId: child.id, memoryId: 't:Kitchen', kind: 'note', text: 'Retry with the same command' });
  assert.equal(social(host).stories.filter(s => s.id === storyId).length, 1);
  const object = { id: 'child-stool01', kind: 'stool', label: 'little stool', color: null, material: 'wood', zone: 'front-left', relation: 'none', target: null, scale: 1, quote: 'a little stool', extra: 'dropped' };
  await assert.rejects(sam.send({ type: 'object', perspectiveId: child.id, memoryId: 't:Kitchen', storyId, object, placement: { ...placement, x: 99 } }));
  await sam.send({ type: 'object', perspectiveId: child.id, memoryId: 't:Kitchen', storyId, object, placement });
  const thing = await waitFor(() => social(host).objects.find(o => o.storyId === storyId));
  assert.equal(thing.data.label, 'little stool'); assert.equal(thing.data.extra, undefined);

  // Handed to the grandparent: it waits there; a stale answer is refused; keeping it copies story and thing.
  await sam.send({ type: 'pass-story', storyId, toPerspectiveId: grandparent.id });
  const handoff = await waitFor(() => social(host).handoffs.find(h => h.storyId === storyId && h.status === 'pending'));
  await assert.rejects(host.send({ type: 'respond-handoff', handoffId: handoff.id, accept: true, revision: handoff.revision + 5 }), /changed/);
  await host.send({ type: 'respond-handoff', handoffId: handoff.id, accept: true, revision: handoff.revision });
  const copy = await waitFor(() => social(host).stories.find(s => s.perspectiveId === grandparent.id && s.handedFrom === child.id));
  assert.equal(copy.speakerName, 'Lily');
  await waitFor(() => social(host).objects.find(o => o.perspectiveId === grandparent.id && o.data.id === 'child-stool01'));

  // Archive photographs only from a search this connection made; the companion thread trims itself.
  await assert.rejects(sam.send({ type: 'pin-perspective', referenceId: 'https://www.loc.gov/item/x/', perspectiveId: child.id, placement }), /Search/);
  await host.send({ type: 'turn', commandId: randomUUID(), perspectiveId: grandparent.id, who: 'companion', text: 'The stool, by the stove.' });
  await waitFor(() => social(host).turns.some(x => x.perspectiveId === grandparent.id && x.speakerName === 'Companion'));

  // Where each perspective stands in a memory: a default, then the story's; a default never replaces the story's.
  await host.send({ type: 'spot', perspectiveId: child.id, memoryId: 't:Kitchen', x: 1.4, z: -0.8, source: 'default' });
  await sam.send({ type: 'spot', perspectiveId: child.id, memoryId: 't:Kitchen', x: 1.9, z: -1.2, objectId: 'child-stool01', source: 'story', quote: 'by the stove' });
  await host.send({ type: 'spot', perspectiveId: child.id, memoryId: 't:Kitchen', x: 0, z: 0, source: 'default' });
  const spot = await waitFor(() => social(host).spots.find(s => s.perspectiveId === child.id && s.memoryId === 't:Kitchen' && s.source === 'story'));
  assert.ok(Math.abs(spot.x - 1.9) < 1e-3 && spot.objectId === 'child-stool01');
  await assert.rejects(sam.send({ type: 'spot', perspectiveId: child.id, memoryId: 't:Kitchen', x: 40, z: 0, source: 'story' }));
  assert.ok(!(social(stranger).spots ?? []).some(s => s.perspectiveId === child.id));

  // Leaving drops that person's pose for everyone.
  sam.close();
  await waitFor(() => !poses(host).some(p => p.memberId === room.recipientId), 8000);
});

test('perspectives are erased with the room', { timeout: 30000 }, async t => {
  const room = await makeRoom(); const host = await client(room.owner); t.after(() => host.close());
  const token = process.env.SPACETIME_TOKEN ?? readFileSync('.spacetime/config/cli.toml', 'utf8').match(/^spacetimedb_token\s*=\s*"([^"]+)"/m)?.[1];
  let db;
  await new Promise((resolve, reject) => {
    db = DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName('heirloom-exchange').withToken(token)
      .onConnect(c => c.subscriptionBuilder().onApplied(resolve).onError((_ctx, e) => reject(e)).subscribe(['SELECT * FROM perspective', 'SELECT * FROM perspective_story']))
      .onConnectError((_ctx, e) => reject(e)).build();
  });
  t.after(() => db.disconnect());
  const s = await waitFor(() => social(host)?.perspectives.length === 2 && social(host));
  const commandId = randomUUID();
  await host.send({ type: 'story', commandId, perspectiveId: s.perspectives[0].id, memoryId: 't:Test', kind: 'note', text: 'Erase this fictional memory.' });
  const storyId = `${room.context.roomId}:${commandId}`;
  await waitFor(() => db.db.perspectiveStory.id.find(storyId));
  await backend.mutation(ref('consents:deleteMemory'), { ...room.owner, confirmText: room.owner.code });
  await waitFor(() => !db.db.perspectiveStory.id.find(storyId) && ![...db.db.perspective.iter()].some(p => p.roomId === room.context.roomId), 20000);
});
