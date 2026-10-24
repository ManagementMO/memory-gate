import { existsSync, readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
const readEnv = file => Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1).trim()]; }));
const config=readEnv('.env.worker');
const client=new ConvexHttpClient(config.CONVEX_URL);
const secret=config.WORKER_SECRET;
const manifest=JSON.parse(readFileSync(new URL('../fixtures/builtin/manifest.json',import.meta.url),'utf8'));
const existing=await client.query(api.doctor.seedState,{secret});
const { createHash }=await import('node:crypto');
async function upload(file, type, prior) {
  const bytes=readFileSync(file);
  if (prior?.file?.sha256===createHash('sha256').update(bytes).digest('base64')) return prior.fileId;
  const url=await client.mutation(api.admin.uploadUrl,{secret});
  const result=await fetch(url,{method:'POST',headers:{'Content-Type':type},body:bytes});
  if(!result.ok) throw new Error(`Asset upload failed: ${result.status}`);
  return (await result.json()).storageId;
}
const aliases={bench:['banco','banca'],tree:['árbol','arbol'],gate:['puerta','portón'],photograph:['photo','foto','keepsake'],
  chair:['wooden chair','side chair','silla'],piano:['upright piano','old piano'],radio:['old radio','wireless'],armchair:['easy chair','arm chair']};
for(const item of manifest.assets) {
  const fileId=await upload(new URL(`../fixtures/builtin/${item.file}`,import.meta.url),'model/gltf-binary',existing.library.find(l=>l.key===item.key));
  await client.mutation(api.admin.upsertLibrary,{secret,key:item.key,synonyms:aliases[item.key]??[],fileId,size:item.size,yawOffset:0,
    source:'original-procedural',credit:'Project-owned original illustrative geometry (reproducible source)'});
}
const photo=await upload(new URL('../fixtures/sample-photo-1938.jpg',import.meta.url),'image/jpeg',existing.assets.find(a=>a.key==='photo.sample'));
await client.mutation(api.admin.upsertAsset,{secret,key:'photo.sample',fileId:photo,meta:{credit:'Library of Congress, public-domain sample photo; illustrative courtyard is independent of this photo.'}});
// Keep existing live flags untouched when explicitly seeding with --live.
if(!process.argv.includes('--live')) await client.mutation(api.admin.setFlags,{secret,values:{
  'splat.live':false,'objects.live':false,'ai.live':false,'stt.live':false,'tts.live':false,'worldlabs.backdrop':false,'worldlabs.generate':false,'splat.lite':false,
}});
console.log(`Seeded ${manifest.assets.length} original props and the permitted sample photo. Scenery: illustrative courtyard; no photo-to-3D generation claimed.`);
if (existsSync(new URL('../fixtures/worlds/courtyard.json', import.meta.url))) await import('./seed-story-world.mjs');
