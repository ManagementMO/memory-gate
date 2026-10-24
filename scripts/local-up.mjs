// Cross-platform, local-only startup. No provider activation, cloud deployment or new paid jobs.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
for (const file of ['.env.local', '.env.exchange']) if (existsSync(file)) process.loadEnvFile(file);
process.env.CONVEX_AGENT_MODE = 'anonymous';
process.env.ATLAS_MODE ??= 'local';
const hosts = ['localhost', '127.0.0.1', ...Object.values(os.networkInterfaces()).flat().filter(n => n?.family === 'IPv4' && !n.internal).map(n => n.address)];
process.env.EXCHANGE_ORIGINS ??= hosts.flatMap(h => [`http://${h}:5173`, `https://${h}:5174`, `https://${h}:5180`, `https://${h}:4180`]).join(',');
mkdirSync('.logs', { recursive: true });
const spacetime = process.env.SPACETIME_BIN ?? 'spacetime';
const node = process.execPath;
const up = port => new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.setTimeout(500); socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false); });
});
async function waitUntil(fn, label, ms = 90_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 1000)); }
  throw new Error(`${label} did not become ready. Inspect its file in .logs/.`);
}
function run(executable, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: process.env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Command failed (${code}): ${path.basename(executable)} ${args[0]}`)));
  });
}
async function background(name, port, executable, args, cwd = root, extra = {}) {
  if (await up(port)) { console.log(`${name}: already listening on ${port}`); return; }
  const fd = openSync(`.logs/${name}.log`, 'a', 0o600);
  const child = spawn(executable, args, { cwd, env: { ...process.env, ...extra }, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  writeFileSync(`.logs/${name}.pid`, String(child.pid), { mode: 0o600 }); child.unref();
  await waitUntil(() => up(port), name); console.log(`${name}: ready on ${port}`);
}
try {
  for (const folder of ['.', 'apps/phone', 'apps/headset', 'actors/historical-memory-atlas', 'spacetimedb']) {
    if (!existsSync(path.join(folder, 'node_modules'))) throw new Error(`Install dependencies first: npm --prefix ${folder} ci`);
  }
  await background('convex', 3210, node, ['node_modules/convex/bin/main.js', 'dev', '--tail-logs', 'disable']);
  if (!existsSync('.env.worker')) await run(node, ['scripts/env-push.mjs']);
  await run(node, ['--experimental-transform-types', 'scripts/ensure-seeded.mjs']);
  await background('spacetime', 3000, spacetime, ['--root-dir', '.spacetime', 'start', '--listen-addr', '127.0.0.1:3000', '--data-dir', '.spacetime/data', '--non-interactive']);
  // Publishes only to loopback and preserves existing data; no destructive migration flag.
  await run(spacetime, ['--root-dir', '.spacetime', 'publish', '--server', 'http://127.0.0.1:3000', '--module-path', 'spacetimedb', '--yes=skip-login', process.env.SPACETIME_DATABASE ?? 'heirloom-exchange']);
  await background('exchange', 3212, node, ['--import', 'tsx', 'scripts/exchange.mjs']);
  await waitUntil(async () => { try { return (await fetch('http://127.0.0.1:3212/health')).ok; } catch { return false; } }, 'exchange subscriptions');
  await background('phone', 5173, node, ['node_modules/vite/bin/vite.js'], path.join(root, 'apps/phone'));
  await background('phone-https', 5174, node, ['node_modules/vite/bin/vite.js'], path.join(root, 'apps/phone'), { PHONE_HTTPS: '1' });
  if (!(await up(4173))) await run(node, ['node_modules/vite/bin/vite.js', 'build'], path.join(root, 'apps/headset'));
  await background('headset-preview', 4173, node, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--host', '0.0.0.0'], path.join(root, 'apps/headset'));
  if (!existsSync('.logs/practice-room.json')) await run(node, ['scripts/practice-room.mjs']);
  console.log('Local demo ready: http://localhost:5173. Run npm run demo:links for private participant URLs.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
