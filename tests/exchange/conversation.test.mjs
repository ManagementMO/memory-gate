// The companion's one conversation with everyone in a visit (services/exchange/conversation.mjs), through the real
// gateway and SpacetimeDB. Offline rooms, so the brain's offline rules answer (no provider calls). Needs the local
// stack (npm run local:up; CONVEX_URL / EXCHANGE_WS / SPACETIME_DATABASE point elsewhere when set).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DbConnection } from '../../services/exchange/bindings/index.ts';
import { backend, ref, makeRoom, client, waitFor } from './helpers.mjs';

const social = (c) => c.messages.findLast(m => m.type === 'social')?.social;
const lines = (c) => c.messages.filter(m => m.type === 'companion');
const answers = (c) => lines(c).filter(l => !['welcome', 'line'].includes(l.intent));
const say = (c, text, snrDb, extra = {}) => c.send({ type: 'utterance', turnId: randomUUID(), text, snrDb, durationMs: 1500, device: 'desktop', ...extra });
const flow = { type: 'flow', stage: 'gathering', turnsInPhase: 0, invitedToEnter: false, place: null, media: null, mediaCaption: null };

async function together(t) {
  const room = await makeRoom();
  await backend.mutation(ref('rooms:rename'), { ...room.owner, displayName: 'Rosa' });
  await backend.mutation(ref('rooms:rename'), { ...room.recipient, displayName: 'Lily' });
  const host = await client(room.owner);
  await waitFor(() => social(host)?.perspectives.length === 2, 30000);
  const lily = await client(room.recipient);
  t.after(() => { host.close(); lily.close(); });
  await host.send(flow);
  return { room, host, lily };
}

test('one conversation: shared words kept once for the louder mic, one answer to everyone after the lull', { timeout: 60000 }, async t => {
  const { host, lily } = await together(t);
  const elsewhere = await makeRoom(); const stranger = await client(elsewhere.owner);
  t.after(() => stranger.close());
  // Lily joined a visit already under way: the companion welcomes her, to both devices.
  await waitFor(() => lines(host).some(l => l.intent === 'welcome' && /Lily/.test(l.text)) && lines(lily).some(l => l.intent === 'welcome'), 30000);

  // The same words from both microphones: Rosa's (close, loud) is kept; Lily's mic only heard her faintly.
  const [rosa, faint] = await Promise.all([say(host, 'We flew the red kite by the old oak tree', 28), say(lily, 'we flew the red kite by the old oak', 9)]);
  assert.equal(rosa.result.own, true);
  assert.deepEqual([faint.result.own, faint.result.reason], [false, 'duplicate']);
  // Lily's own words a moment later are hers.
  assert.equal((await say(lily, 'and I held the string', 25)).result.own, true);

  // One answer, after the lull, to everything just said, on both devices (never another visit's).
  const answer = await waitFor(() => answers(host)[0], 15000);
  assert.equal((await waitFor(() => answers(lily).find(l => l.id === answer.id))).text, answer.text);
  assert.deepEqual(answer.heard.map(h => h.name), ['Rosa', 'Lily']);
  await new Promise(r => setTimeout(r, 2500));
  assert.equal(answers(host).length, 1, 'once for everything said, not once per utterance');
  assert.ok(!lines(stranger).some(l => l.id === answer.id));

  // The conversation is kept, by name, without the faint copy, and every device in the visit has it.
  const kept = await waitFor(() => (social(lily)?.conversation ?? []).some(c => c.id === answer.id) && social(lily).conversation);
  assert.deepEqual(kept.filter(c => c.who === 'person').map(c => [c.speakerName, c.text]), [['Rosa', 'We flew the red kite by the old oak tree'], ['Lily', 'and I held the string']]);
  assert.ok(!(social(stranger)?.conversation ?? []).length);

  // The host's own lines reach the others (not echoed back); speaking over the companion stops it everywhere.
  await host.send({ type: 'line', commandId: randomUUID(), text: 'Here we are.' });
  await waitFor(() => lines(lily).some(l => l.text === 'Here we are.' && l.scripted));
  assert.ok(!lines(host).some(l => l.text === 'Here we are.'));
  await lily.send({ type: 'hush' });
  await waitFor(() => host.messages.some(m => m.type === 'hush'));
  // A guest can't steer the visit's state; the host can.
  await lily.send({ ...flow, stage: 'album' });
  assert.equal((await say(host, 'Can you see the hills?', 26)).result.own, true);
  await waitFor(() => answers(host).length === 2, 12000); // still speaking: the guest's "album" was ignored
});

test('an overlapping turn still being finished is waited for, so the louder mic decides', { timeout: 30000 }, async t => {
  const { host, lily } = await together(t);
  const turnId = randomUUID();
  host.socket.send(JSON.stringify({ type: 'hearing', turnId })); // Rosa has started talking
  await new Promise(r => setTimeout(r, 300));
  const faint = say(lily, 'the ribbon was cream coloured', 8); // Lily's mic hears her faintly and finishes first
  await new Promise(r => setTimeout(r, 400));
  const rosa = await say(host, 'The ribbon was cream coloured', 27, { turnId });
  assert.equal(rosa.result.own, true);
  assert.deepEqual(((await faint).result), { own: false, reason: 'duplicate' });
  // A clip is only kept when this person's voice may be (no recording consent in this room).
  assert.equal((await say(lily, 'I want to fly it again', 25, { audioFileId: 'kg2abcdefabcdefabcdefabcdefabcd' })).result.audioFileId, null);
});

test('the conversation is summarised as it grows and erased with the room', { timeout: 60000 }, async t => {
  const { room, host, lily } = await together(t);
  // Questions put to the companion are answered at each lull: a dozen turns brings a summary (offline here).
  for (let i = 0; i < 6; i++) {
    await say(i % 2 ? lily : host, i % 2 ? `Was the kite red, ${i}?` : `Can you see the oak, ${i}?`, 26);
    await waitFor(() => answers(host).length === i + 1, 12000);
  }
  const summary = await waitFor(() => social(host)?.conversationSummary, 15000);
  assert.match(summary, /Rosa and Lily talked about/);

  const token = process.env.SPACETIME_TOKEN ?? readFileSync('.spacetime/config/cli.toml', 'utf8').match(/^spacetimedb_token\s*=\s*"([^"]+)"/m)?.[1];
  let db;
  t.after(() => db?.disconnect());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SpacetimeDB did not answer.')), 10_000);
    db = DbConnection.builder().withUri('ws://127.0.0.1:3000').withDatabaseName(process.env.SPACETIME_DATABASE ?? 'heirloom-exchange').withToken(token)
      .onConnect(c => c.subscriptionBuilder().onApplied(() => { clearTimeout(timer); resolve(); }).onError((_ctx, e) => reject(e)).subscribe(['SELECT * FROM conversation_turn', 'SELECT * FROM conversation_summary', 'SELECT * FROM utterance']))
      .onConnectError((_ctx, e) => reject(e)).build();
  });
  const roomId = room.context.roomId;
  const mine = () => [...db.db.conversationTurn.iter(), ...db.db.utterance.iter()].filter(r => r.roomId === roomId).length + (db.db.conversationSummary.roomId.find(roomId) ? 1 : 0);
  assert.ok(mine() > 0);
  await backend.mutation(ref('consents:deleteMemory'), { ...room.owner, confirmText: room.owner.code });
  await waitFor(() => mine() === 0, 25000);
});
