// End-to-end check of the GPU worker against the running local Convex backend, as the phone would drive it:
// create a room -> consent (photo_processing + vendor_upload_modal) -> upload a photo -> addPhoto (splat.live queues a
// job) -> wait until THAT splat is ready -> download the SPZ and the lite SPZ and read both back with @adobe/spz.
// The worker must be running (worker/start.sh). Prints one JSON line; exit 1 if the splat is not a real SHARP result.
// Usage: node worker/e2e.mjs <photo.jpg> --credit "<source>" [--timeout 200] [--title "..."]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import createSpzModule from '@adobe/spz';
import { api } from '../convex/_generated/api.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const photoPath = argv[0];
if (!photoPath || photoPath.startsWith('--')) { console.error('usage: node worker/e2e.mjs <photo.jpg> --credit "<source>" [--timeout 200]'); process.exit(2); }
const credit = opt('credit', 'Sample photo (public domain)');
const timeoutMs = Number(opt('timeout', '200')) * 1000;

const env = Object.fromEntries(readFileSync(path.join(REPO, '.env.worker'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const client = new ConvexHttpClient(env.CONVEX_URL);

function jpegSize(buf) { // SOFn marker -> [width, height]
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('not a JPEG (no SOF marker)');
}

const photo = readFileSync(photoPath);
const [width, height] = jpegSize(photo);
const { code, token } = await client.mutation(api.rooms.create, { title: `Worker e2e ${path.basename(photoPath)}`, displayName: 'Worker test' });
await client.mutation(api.consents.give, { code, token, scopes: ['photo_processing', 'vendor_upload_modal'] });

const t0 = Date.now(); // photo upload starts
const uploadUrl = await client.mutation(api.splats.generatePhotoUploadUrl, { code, token });
const up = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: photo });
if (!up.ok) throw new Error(`photo upload ${up.status}`);
const { storageId } = await up.json();
const tUploaded = Date.now();
const added = await client.mutation(api.splats.addPhoto, { code, token, fileId: storageId, width, height, tone: 'mono', credit });
const tQueued = Date.now();
if (!added.live) { console.log(JSON.stringify({ ok: false, error: 'addPhoto did not queue a live job (splat.live off or no vendor_upload_modal consent)', added })); process.exit(1); }

let room, seenRunning = null;
for (;;) {
  room = await client.query(api.rooms.get, { code, token });
  const mine = room.recentSplats.find((s) => s.id === added.splatId);
  if (mine?.status === 'running' && seenRunning === null) seenRunning = Date.now() - t0;
  if (mine && (mine.status === 'ready' || mine.status === 'failed')) break;
  if (Date.now() - t0 > timeoutMs) { console.log(JSON.stringify({ ok: false, error: 'timed out', code, splat: mine })); process.exit(1); }
  await new Promise((r) => setTimeout(r, 250));
}
const tReady = Date.now();
const mine = room.recentSplats.find((s) => s.id === added.splatId);
const splat = room.splat;
const result = {
  photo: path.basename(photoPath), width, height, room: code, splatId: added.splatId, status: mine.status, source: mine.source, error: mine.error,
  ms: { upload: tUploaded - t0, queued: tQueued - t0, claimed: seenRunning, photoUploadToReady: tReady - t0, addPhotoToReady: tReady - tQueued },
};
if (mine.status !== 'ready' || mine.source !== 'sharp' || splat?.id !== added.splatId) {
  console.log(JSON.stringify({ ok: false, ...result, activeSplat: splat?.id ?? null }));
  process.exit(1);
}
const spz = await createSpzModule();
const read = async (url) => {
  const t = Date.now();
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const c = spz.loadSpzFromBuffer(buf, { to: spz.CoordinateSystem.UNSPECIFIED });
  let finite = 0; for (let i = 0; i < c.positions.length; i++) if (Number.isFinite(c.positions[i])) finite++;
  return { bytes: buf.length, numPoints: c.numPoints, allPositionsFinite: finite === c.positions.length, downloadAndParseMs: Date.now() - t };
};
const main = await read(splat.url);
const lite = splat.liteUrl ? await read(splat.liteUrl) : null;
const ok = main.numPoints === splat.numSplats && main.numPoints > 0 && main.allPositionsFinite && !!lite && lite.numPoints > 0 && lite.numPoints <= main.numPoints;
console.log(JSON.stringify({ ok, ...result, numSplats: splat.numSplats, floorY: splat.floorY, scale: splat.scale, spz: main, lite }));
process.exit(ok ? 0 : 1);
