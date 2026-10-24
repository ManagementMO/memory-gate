import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
export const backend = new ConvexHttpClient(process.env.CONVEX_URL ?? 'http://127.0.0.1:3210');
export const ref = makeFunctionReference;
export const waitFor = async (fn, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 30)); }
  throw new Error('Condition did not become true before the deadline.');
};
export async function makeRoom() {
  const owner = await backend.mutation(ref('rooms:create'), { title: 'Exchange verification (fictional)', displayName: 'Alex', offline: true, demo: true });
  const room = await backend.query(ref('rooms:get'), owner);
  const recipient = await backend.mutation(ref('rooms:join'), { code: owner.code, key: room.joinKey, displayName: 'Sam', role: 'storyteller' });
  const bystander = await backend.mutation(ref('rooms:join'), { code: owner.code, key: room.joinKey, displayName: 'Taylor', role: 'family' });
  await backend.mutation(ref('consents:give'), { ...owner, scopes: ['voice_processing', 'share_with_family'] });
  const { utteranceId } = await backend.mutation(ref('utterances:add'), { ...owner, transcript: 'We sat by the tree and watched the afternoon light. This is a fictional test story.', source: 'typed', commandId: randomUUID() });
  const context = await waitFor(async () => { const c = await backend.query(ref('exchange:context'), owner); return c.sources.some(s => s.id === utteranceId) ? c : null; });
  return { owner, recipient, bystander, context, sourceId: utteranceId, recipientId: context.members.find(m => m.name === 'Sam').id };
}
export async function client(auth) {
  const socket = new WebSocket(process.env.EXCHANGE_WS ?? 'ws://127.0.0.1:3212/exchange', { origin: 'http://127.0.0.1:5173' });
  const messages = []; const pending = new Map();
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString()); messages.push(message);
    if (['ack', 'error'].includes(message.type)) {
      const p = pending.get(message.requestId); if (!p) return;
      clearTimeout(p.timer); pending.delete(message.requestId);
      message.type === 'ack' ? p.resolve(message) : p.reject(new Error(message.message));
    }
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const send = message => new Promise((resolve, reject) => {
    const requestId = randomUUID(); const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Exchange reply timed out')); }, 15000);
    pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ ...message, requestId }));
  });
  if (auth) await send({ type: 'join', ...auth });
  return { socket, messages, send, snapshot: () => messages.findLast(m => m.type === 'snapshot'), close: () => socket.close() };
}
