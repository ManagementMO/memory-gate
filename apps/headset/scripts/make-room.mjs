// Test room for the headset: rooms.create (as the "family" owner) -> consents.give with all six scopes.
// Prints the code and saves {code, token} to apps/headset/.test-room.json (gitignored; a member token, not a key).
// Usage: node scripts/make-room.mjs ["Room title"]
import { readFileSync, writeFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';

const root = new URL('../../../', import.meta.url);
const env = readFileSync(new URL('.env.local', root), 'utf8');
const url = process.env.CONVEX_URL ?? env.match(/^CONVEX_URL=(.+)$/m)?.[1]?.trim() ?? 'http://127.0.0.1:3210';
const client = new ConvexHttpClient(url);
const title = process.argv[2] ?? 'The living room, 1938 (sample)';
const { code, token } = await client.mutation(api.rooms.create, { title, displayName: 'Ana (sample family)', demo: true });
await client.mutation(api.consents.give, { code, token, scopes: ['photo_processing', 'voice_processing', 'voice_recording', 'vendor_upload_modal', 'vendor_upload_worldlabs', 'share_with_family'] });
const view = await client.query(api.rooms.get, { code, token });
writeFileSync(new URL('../.test-room.json', import.meta.url), JSON.stringify({ code, token, key: view.joinKey ?? null, url, createdAt: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ code, title: view.room.title, splat: view.splat ? { status: view.splat.status, source: view.splat.source, numSplats: view.splat.numSplats, floorY: view.splat.floorY, scale: view.splat.scale, hasUrl: !!view.splat.url } : null, flags: view.flags }));
