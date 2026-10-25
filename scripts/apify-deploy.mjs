// Explicit cloud deployment. Only the Actor's source allowlist is uploaded; never .env or local storage.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const parse = path => existsSync(path) ? Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })) : {};
const env = { ...parse('.env.exchange'), ...process.env, ...parse(process.env.MEMORY_GATE_ENV || process.env.MEMGATE_AUTH_FILE || 'auth/memory-gate.env') };
const root = 'actors/historical-memory-atlas', config = JSON.parse(readFileSync(`${root}/.actor/actor.json`, 'utf8'));
const names = ['Dockerfile', 'package.json', 'package-lock.json', 'README.md', '.actor/actor.json', '.actor/input_schema.json', '.actor/output_schema.json', 'src/main.mjs', 'src/archive.mjs', 'src/social.mjs', 'src/places.mjs', 'src/knowledge.mjs'];
const sourceFiles = names.map(name => ({ name, format: 'TEXT', content: readFileSync(`${root}/${name}`, 'utf8') }));
const sourceHash = createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex');
if (!process.argv.includes('--build')) { console.log(JSON.stringify({ name: config.name, version: config.version, files: names, sourceHash, note: 'Pass --build to deploy privately to your Apify account.' }, null, 2)); process.exit(0); }
if (!env.APIFY_TOKEN || env.ALLOW_APIFY_CLOUD !== '1') throw Error('Save APIFY_TOKEN and ALLOW_APIFY_CLOUD=1 in the ignored provider configuration.');
async function api(path, method = 'GET', body) {
  const response = await fetch('https://api.apify.com/v2/' + path, { method, redirect: 'error', headers: { Authorization: `Bearer ${env.APIFY_TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) throw Error(`Apify ${method} ${path.split('?')[0]} returned HTTP ${response.status}. Inspect the existing Actor/build before retrying.`);
  return (await response.json()).data;
}
mkdirSync('.logs', { recursive: true });
const me = await api('users/me'), fullName = `${me.username}~${config.name}`;
const version = { versionNumber: config.version, sourceType: 'SOURCE_FILES', buildTag: 'latest', sourceFiles };
let actor = await api(`actors/${fullName}`);
if (!actor) actor = await api('actors', 'POST', { name: config.name, title: config.title, description: config.description, isPublic: false, actorPermissionLevel: 'LIMITED_PERMISSIONS', defaultRunOptions: { build: 'latest', timeoutSecs: 210, memoryMbytes: 256, restartOnError: false }, versions: [version] });
else {
  const existing = await api(`actors/${actor.id}/versions/${config.version}`);
  await api(`actors/${actor.id}/versions${existing ? '/' + config.version : ''}`, existing ? 'PUT' : 'POST', version);
}
let build = await api(`actors/${actor.id}/builds?version=${config.version}&tag=latest`, 'POST');
const state = { actorId: actor.id, actorName: fullName, version: config.version, buildId: build.id, sourceHash, privateDeployment: !actor.isPublic };
const save = () => writeFileSync('.logs/apify-deployment.json', JSON.stringify({ ...state, status: build.status }, null, 2) + '\n');
save(); console.log(JSON.stringify({ ...state, status: build.status }));
for (let i = 0; i < 24 && ['READY', 'RUNNING'].includes(build.status); i++) { await new Promise(r => setTimeout(r, 5000)); build = await api(`actor-builds/${build.id}`); save(); }
if (build.status !== 'SUCCEEDED') throw Error(`Saved build ${build.id} is ${build.status}; inspect it before rebuilding.`);
let file = readFileSync('.env.exchange', 'utf8');
file = /^APIFY_MEMORY_ACTOR_ID=/m.test(file) ? file.replace(/^APIFY_MEMORY_ACTOR_ID=.*$/m, `APIFY_MEMORY_ACTOR_ID=${actor.id}`) : file.trimEnd() + `\nAPIFY_MEMORY_ACTOR_ID=${actor.id}\n`;
writeFileSync('.env.exchange', file);
console.log(JSON.stringify({ status: build.status, actorId: actor.id, buildId: build.id, configuredLocally: true }));
