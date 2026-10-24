// One real call to each Claude-backed action (companion turn, plan from words) through the local backend.
// Spends a few cents; prints the results and the running spend estimate.
import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api.js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const c = new ConvexHttpClient(env.CONVEX_URL);
const room = await c.mutation(api.rooms.create, { title: 'Live check', displayName: 'Tester', demo: false, offline: false });
await c.mutation(api.consents.give, { code: room.code, token: room.token, scopes: ['voice_processing', 'voice_recording', 'photo_processing', 'share_with_family'] });
const words = process.argv[2] ?? 'My grandmother’s kitchen, in the morning. Yellow curtains on the window, a round wooden table with two chairs, and her radio on the counter.';
let t = Date.now();
const reply = await c.action(api.guide.respond, { code: room.code, token: room.token, input: { phase: 'gathering', transcript: words, history: [{ who: 'companion', text: 'Is there a moment you’d like to visit today?' }], media: null, mediaCaption: null, place: null, invitedToEnter: false, turnsInPhase: 1 } });
console.log(`guide.respond (${Date.now() - t} ms):`, JSON.stringify(reply));
t = Date.now();
const planned = await c.action(api.sketch.plan, { code: room.code, token: room.token, words: [words] });
console.log(`sketch.plan (${Date.now() - t} ms) source=${planned.source}`);
console.log(JSON.stringify(planned.plan, null, 1).slice(0, 3000));
console.log('spend:', JSON.stringify(await c.query(api.budget.status, {})));
