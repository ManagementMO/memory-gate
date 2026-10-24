// Explicit local integration rehearsal. Private fixture sessions stay in ignored .logs/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { makeRoom, client, waitFor } from './helpers.mjs';
if (process.argv[2] === 'prepare') {
  const room = await makeRoom(); const sender = await client(room.owner); const recipient = await client(room.recipient);
  try {
    const commandId = randomUUID();
    await sender.send({ type: 'pass', sourceId: room.sourceId, recipientId: room.recipientId, title: 'A memory across restarts', commandId });
    const capsule = await waitFor(() => recipient.snapshot()?.capsules.find(c => c.id.endsWith(commandId)));
    await recipient.send({ type: 'respond', capsuleId: capsule.id, status: 'accepted', revision: capsule.revision });
    await mkdir('.logs', { recursive: true });
    await writeFile('.logs/exchange-restart.json', JSON.stringify({ recipient: room.recipient, capsuleId: capsule.id }));
    console.log('Prepared accepted memory for database and gateway restart.');
  } finally { sender.close(); recipient.close(); }
} else {
  const fixture = JSON.parse(await readFile('.logs/exchange-restart.json', 'utf8'));
  const recipient = await client(fixture.recipient);
  const archive = JSON.parse(await readFile('.logs/archive-restart.json', 'utf8'));
  const guest = await client(archive.guest);
  try {
    const capsule = await waitFor(() => recipient.snapshot()?.capsules.find(c => c.id === fixture.capsuleId));
    assert.equal(capsule.status, 'accepted'); assert.equal(capsule.revision, 1);
    await recipient.send({ type: 'open', capsuleId: capsule.id });
    const opened = await waitFor(() => recipient.messages.find(m => m.type === 'opened'));
    assert.match(opened.source.transcript, /fictional test story/);
    assert(guest.snapshot().references.some(r => r.title === archive.title));
    const result = { at: new Date().toISOString(), phase: process.argv[2] ?? 'check', acceptedMemory: true, originalSource: true, sharedArchiveBoard: true, environment: 'Local persistent SpacetimeDB 2.13.0 and authenticated gateway; real process restart' };
    await mkdir('evidence/calhacks-exchange', { recursive: true });
    await writeFile(`evidence/calhacks-exchange/${process.argv[2] === 'gateway-restart' ? 'gateway' : 'database'}-restart.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { recipient.close(); guest.close(); }
}
