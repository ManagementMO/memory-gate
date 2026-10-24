// Direct Cartesia STT probe (outside the browser): mint a token through the backend, stream a WAV, finalize.
import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const c = new ConvexHttpClient(env.CONVEX_URL);
const room = await c.mutation(api.rooms.create, { title: 'STT probe', displayName: 'Probe', demo: false, offline: false });
await c.mutation(api.consents.give, { code: room.code, token: room.token, scopes: ['voice_processing'] });
const m = await c.action(api.voice.mintToken, { code: room.code, token: room.token });
console.log('minted:', !!m.token, 'stt', m.sttLive, 'tts', m.ttsLive);
// 16 kHz mono s16le from the 48 kHz test WAV (simple decimation is fine for a probe)
const wav = readFileSync(process.argv[2]);
const pcm48 = new Int16Array(wav.buffer, wav.byteOffset + 44, Math.floor((wav.length - 44) / 2));
const pcm = new Int16Array(Math.floor(pcm48.length / 3)); for (let i = 0; i < pcm.length; i++) pcm[i] = pcm48[i * 3];
const url = `wss://api.cartesia.ai/stt/websocket?model=ink-2&encoding=pcm_s16le&sample_rate=16000&cartesia_version=${m.cartesiaVersion}&access_token=${m.token}`;
const t0 = Date.now();
const ws = new WebSocket(url);
let text = '';
ws.onopen = async () => {
  console.log(`open in ${Date.now() - t0} ms`);
  const start = 16000 * 16, end = start + 16000 * 9; // the first spoken sentence
  for (let i = start; i < end; i += 1600) { ws.send(pcm.slice(i, i + 1600).buffer); await new Promise((r) => setTimeout(r, 20)); }
  ws.send('finalize');
};
ws.onmessage = (e) => { const msg = JSON.parse(e.data); if (msg.type === 'transcript' && msg.is_final) text += msg.text; if (msg.type === 'flush_done') { console.log(`transcript (${Date.now() - t0} ms): ${text}`); ws.send('close'); } if (msg.type === 'error') console.log('error', JSON.stringify(msg).slice(0, 200)); };
ws.onerror = (e) => console.log('ws error', e?.message ?? e?.type);
ws.onclose = (e) => { console.log(`closed ${e.code} ${e.reason ?? ''}`); process.exit(0); };
setTimeout(() => { console.log('timeout'); process.exit(1); }, 30000);
