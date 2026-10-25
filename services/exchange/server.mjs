import http from 'node:http';
import { createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { DbConnection } from './bindings/index.ts';
import { runArchive } from './archive-runner.mjs';
import { createSocial, SOCIAL_SUBSCRIPTIONS } from './social.mjs';

const token = process.env.SPACETIME_TOKEN;
if (!token) throw new Error('SPACETIME_TOKEN is required by the private exchange gateway.');
if (!process.env.WORKER_SECRET) throw new Error('WORKER_SECRET is required for room-deletion reconciliation. Run npm run env:push for the local backend.');
const convex = new ConvexHttpClient(process.env.CONVEX_URL ?? 'http://127.0.0.1:3210');
const contextRef = makeFunctionReference('exchange:context');
const sourceRef = makeFunctionReference('exchange:source');
const origins = new Set((process.env.EXCHANGE_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173,https://localhost:5174,https://localhost:5180,https://localhost:4180').split(','));
const clients = new Set();
let ready = false; let archiveBusy = false;
let reconciling = false;
const archiveCooldown = new Map();
const db = DbConnection.builder().withUri(process.env.SPACETIME_URL ?? 'ws://127.0.0.1:3000')
  .withDatabaseName(process.env.SPACETIME_DATABASE ?? 'heirloom-exchange').withToken(token).withConfirmedReads(true)
  .withAutomaticReconnect()
  .onConnect(conn => {
    conn.subscriptionBuilder().onApplied(() => { ready = true; refreshAll(); void reconcileDeletedRooms(); }).onError(() => { ready = false; invalidateAll(); })
      .subscribe(['SELECT * FROM capsule', 'SELECT * FROM reference', 'SELECT * FROM presence', ...SOCIAL_SUBSCRIPTIONS]);
  }).onDisconnect(() => { ready = false; invalidateAll(); })
  .onConnectError(() => { ready = false; invalidateAll(); }).build();

function send(client, data) { if (client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(data)); }
function invalidateAll() { for (const c of clients) send(c, { type: 'unavailable', message: 'The memory exchange is reconnecting. Please wait before trying again.' }); }
async function authorize(c) {
  if (!c.auth) throw new Error('Join this room first.');
  return convex.query(contextRef, c.auth);
}
function visibleCapsules(context) {
  const active = new Set(context.members.map(m => m.id));
  return [...db.db.capsule.iter()].filter(c => c.roomId === context.roomId && (c.senderId === context.memberId || c.recipientId === context.memberId)).map(c => ({ ...c,
    senderName: context.members.find(m => m.id === c.senderId)?.name ?? 'Former contributor',
    recipientName: context.members.find(m => m.id === c.recipientId)?.name ?? 'Former participant',
    sourceAvailable: active.has(c.senderId),
  }));
}
async function refresh(c) {
  if (!ready || !c.auth || c.refreshing) return;
  c.refreshing = true;
  try {
    const context = await authorize(c);
    if (!ready) return;
    const board = [...db.db.reference.iter()].filter(r => r.roomId === context.roomId).map(r => ({ ...JSON.parse(r.data), id: r.id, addedBy: r.addedBy, contributor: context.members.find(m => m.id === r.addedBy)?.name ?? 'Former participant' }));
    const online = [...clients].filter(other => other.context?.roomId === context.roomId && Date.now() - other.authorizedAt < 10_000).map(other => other.context.memberId);
    c.context = context; c.authorizedAt = Date.now();
    send(c, { type: 'snapshot', context, capsules: visibleCapsules(context), references: board, presence: presenceOf(context.roomId), now: Date.now(),
      online: [...new Set([...online, context.memberId])], archiveMode: context.offline ? 'disabled-offline' : process.env.ATLAS_MODE ?? 'disabled' });
  } catch {
    c.context = null; c.authorizedAt = 0;
    send(c, { type: 'unavailable', message: 'Sharing is unavailable. Check your room membership and family-sharing permission.' });
  } finally { c.refreshing = false; }
}
function refreshAll() { for (const c of clients) void refresh(c); }
async function reconcileDeletedRooms() {
  if (!ready || reconciling || !process.env.WORKER_SECRET) return;
  reconciling = true;
  try {
    const ids = [...new Set([...[...db.db.capsule.iter(), ...db.db.reference.iter()].map(row => row.roomId), ...social.roomIds()])];
    for (let i = 0; i < ids.length; i += 100) {
      const deleted = await convex.query(makeFunctionReference('exchange:deletedRooms'), { secret: process.env.WORKER_SECRET, roomIds: ids.slice(i, i + 100) });
      for (const roomId of deleted) await db.reducers.purgeRoom({ roomId });
    }
  } catch { console.warn('Room deletion reconciliation will retry; no records were inferred from a failed query.'); }
  finally { reconciling = false; }
}
for (const table of [db.db.capsule, db.db.reference]) {
  table.onInsert(refreshAll); table.onDelete(refreshAll); table.onUpdate(refreshAll);
}
// Presence (who is in a visit, their lights and look-here marks) changes every few seconds: it goes straight to the
// already-authorized devices in that room, without re-checking every client.
function presenceOf(roomId) { return [...db.db.presence.iter()].filter(p => p.roomId === roomId); }
function pushPresence(roomId) {
  const rows = presenceOf(roomId);
  for (const c of clients) if (c.context?.roomId === roomId && Date.now() - c.authorizedAt < 15_000) send(c, { type: 'presence', presence: rows, now: Date.now() });
}
db.db.presence.onInsert((_ctx, row) => pushPresence(row.roomId));
db.db.presence.onUpdate((_ctx, _old, row) => pushPresence(row.roomId));
db.db.presence.onDelete((_ctx, row) => pushPresence(row.roomId));
// A visit happening nearby (same-room devices, one local backend): the freshest present host, offered by code and
// family key so another device can join in one tap. Never offline (test) rooms.
let nearbyCache = { at: 0, value: null };
async function nearby() {
  if (!ready) return null;
  if (Date.now() - nearbyCache.at < 2000) return nearbyCache.value;
  const hosts = [...db.db.presence.iter()].filter(p => p.host && p.leftAt === 0 && Date.now() - p.updatedAt < 20_000).sort((a, b) => b.updatedAt - a.updatedAt);
  let value = null;
  for (const h of hosts.slice(0, 6)) {
    const invite = await convex.query(makeFunctionReference('presence:inviteFor'), { secret: process.env.WORKER_SECRET, roomId: h.roomId }).catch(() => null);
    if (invite) { value = invite; break; }
  }
  nearbyCache = { at: Date.now(), value };
  return value;
}
// Perspectives (poses, stories, handoffs, archive photographs, likenesses): services/exchange/social.mjs.
const social = createSocial({ db, clients, send, convex, authorize, isReady: () => ready });
function requireReady(context) { if (!ready) throw new Error('The exchange is not connected.'); if (context.paused) throw new Error('This room is paused. Resume it before changing memories.'); }
async function action(c, message) {
  if (message.type === 'join') {
    if (c.auth) throw new Error('This connection has already joined a room.');
    if (typeof message.code !== 'string' || typeof message.token !== 'string' || message.token.length > 100) throw new Error('Invalid room session.');
    c.auth = { code: message.code, token: message.token }; await authorize(c); await refresh(c); await social.joined(c); return;
  }
  // Presence: heartbeats reuse this connection's recent authorization (refreshed every 5 s) instead of a check each.
  if (message.type === 'here' || message.type === 'point' || message.type === 'leave') {
    const context = c.context && Date.now() - c.authorizedAt < 10_000 ? c.context : await authorize(c);
    if (!ready) throw new Error('The exchange is not connected.');
    c.context = context;
    const { memberId, roomId } = context;
    if (message.type === 'here') {
      if (!['headset', 'phone', 'desktop'].includes(message.device)) throw new Error('Invalid device.');
      await db.reducers.beHere({ roomId, memberId, host: !!context.isOwner, device: message.device });
    } else if (message.type === 'point') {
      const at = message.at;
      if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) throw new Error('Invalid point.');
      await db.reducers.markPoint({ roomId, memberId, x: at[0], y: at[1], z: at[2] });
    } else { await db.reducers.leaveVisit({ roomId, memberId }); await db.reducers.dropPose({ roomId, memberId }); }
    return;
  }
  if (social.handles(message.type)) return void await social.act(c, message);
  const context = await authorize(c); requireReady(context);
  const { memberId, roomId } = context;
  if (message.type === 'pass') {
    if (!context.sources.some(s => s.id === message.sourceId)) throw new Error('Choose one of your own completed stories.');
    if (!context.members.some(m => m.id === message.recipientId) || message.recipientId === memberId) throw new Error('Choose another current participant.');
    if (typeof message.title !== 'string' || !message.title.trim() || message.title.length > 80 || !/^[a-f0-9-]{36}$/.test(message.commandId ?? '')) throw new Error('A short title and valid command are required.');
    await db.reducers.passMemory({ id: `${roomId}:${message.commandId}`, roomId, sourceId: message.sourceId, senderId: memberId, recipientId: message.recipientId, title: message.title.trim() });
  } else if (message.type === 'respond') {
    if (!Number.isInteger(message.revision) || message.revision < 0 || message.revision > 0xffffffff) throw new Error('Invalid memory revision.');
    await db.reducers.respondMemory({ id: message.capsuleId, roomId, memberId, status: message.status, expectedRevision: message.revision });
  } else if (message.type === 'open') {
    const capsule = db.db.capsule.id.find(message.capsuleId);
    if (!capsule || capsule.roomId !== roomId || capsule.status === 'revoked' || capsule.status === 'dismissed' || (capsule.senderId !== memberId && !(capsule.recipientId === memberId && capsule.status === 'accepted'))) throw new Error('Accept a memory addressed to you before opening it.');
    const source = await convex.query(sourceRef, { ...c.auth, sourceId: capsule.sourceId });
    // Recheck authoritative state after asynchronous media authorization (revocation can race).
    const current = db.db.capsule.id.find(capsule.id);
    if (!current || current.revision !== capsule.revision) throw new Error('The memory changed while opening. Please review it again.');
    send(c, { type: 'opened', capsuleId: capsule.id, source });
  } else if (message.type === 'search') {
    if (context.offline) throw new Error('Public archive requests are disabled in fixture-only rooms.');
    if (archiveBusy || Date.now() - (archiveCooldown.get(roomId) ?? 0) < 30_000) throw new Error('Please allow the current archive search to finish before searching again.');
    archiveBusy = true; archiveCooldown.set(roomId, Date.now());
    try {
      const result = await runArchive(message.input);
      await authorize(c);
      c.references = new Map(result.references.map(r => [r.id, r]));
      send(c, { type: 'search-results', result });
    } finally { archiveBusy = false; }
  } else if (message.type === 'pin') {
    const ref = c.references?.get(message.referenceId);
    if (!ref) throw new Error('Search and review a reference before adding it to the board.');
    const id = `${roomId}:${createHash('sha256').update(ref.sourceUrl).digest('hex')}`;
    await db.reducers.pinReference({ id, roomId, memberId, data: JSON.stringify(ref) });
  } else if (message.type === 'unpin') {
    await db.reducers.unpinReference({ id: message.referenceId, roomId, memberId });
  } else throw new Error('Unknown exchange action.');
  await refresh(c);
}
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/exchange/archive-image/')) { void social.archiveImage(req, res); return; }
  if (req.url === '/nearby' || req.url === '/exchange/nearby') {
    void nearby().then(value => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ nearby: value })); },
      () => { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ nearby: null })); });
    return;
  }
  res.writeHead(req.url === '/health' ? (ready ? 200 : 503) : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ready, backend: 'SpacetimeDB' }));
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16_384 });
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/exchange' || !origins.has(req.headers.origin) || clients.size >= 64) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', socket => {
  const c = { socket, auth: null, context: null, authorizedAt: 0, refreshing: false, busy: false, count: 0, window: Date.now() }; clients.add(c);
  const authTimeout = setTimeout(() => { if (!c.context) socket.close(1008, 'Join timeout'); }, 10_000);
  socket.on('message', async raw => {
    let message;
    try {
      try { message = JSON.parse(raw.toString()); } catch { message = null; }
      // Live heads and hands (~10 a second) have their own lane and limit, never queued behind an action.
      if (message?.type === 'pose') { social.pose(c, message); return; }
      if (Date.now() - c.window > 60_000) { c.count = 0; c.window = Date.now(); }
      if (++c.count > 60) throw new Error('Please slow down.');
      if (!message || typeof message !== 'object' || typeof message.requestId !== 'string' || message.requestId.length > 80) throw new Error('Invalid request.');
      // Presence (heartbeats, marks) and perspectives share this socket: each is one quick write, so they never wait
      // behind (or block) the one-at-a-time exchange actions such as an archive search.
      const quick = ['here', 'point', 'leave'].includes(message.type) || social.handles(message.type);
      if (!quick && c.busy) throw new Error('Your previous action is still being saved.');
      if (!quick) c.busy = true;
      try { await action(c, message); send(c, { type: 'ack', requestId: message.requestId }); } finally { if (!quick) c.busy = false; }
    } catch (error) {
      // Never forward provider errors, auth arguments, stack traces or token-bearing URLs.
      const safe = error instanceof Error && !/token|stack|http|convex|requestid|server error/i.test(error.message) ? error.message.slice(0, 200) : 'This action could not complete. Check your connection and sharing permission.';
      send(c, { type: 'error', requestId: message?.requestId, message: safe });
    }
  });
  socket.on('close', () => { clearTimeout(authTimeout); clients.delete(c); refreshAll(); void social.left(c.context); });
});
const poll = setInterval(refreshAll, 5000);
const cleanup = setInterval(() => { void reconcileDeletedRooms(); void social.reconcileAvatars(); }, 10_000);
server.listen(Number(process.env.EXCHANGE_PORT ?? 3212), '127.0.0.1', () => console.log('Memory exchange gateway listening on 127.0.0.1:3212; private SpacetimeDB subscriptions enabled.'));
function stop() { clearInterval(poll); clearInterval(cleanup); for (const c of clients) c.socket.close(); wss.close(); server.close(); db.disconnect(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
