// Real IWSDK/IWER controller input. Read-only probes observe the rendered objects and native Grabbed tag.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const records = [];
async function command(...args) {
  const cli = fileURLToPath(new URL('../node_modules/@iwsdk/cli/bin/iwsdk.js', import.meta.url));
  const { stdout } = await exec(process.execPath, [cli, ...args], { cwd: new URL('../', import.meta.url), timeout: 45000, maxBuffer: 3e6, windowsHide: true });
  const result = JSON.parse(stdout);
  if (!result.ok) throw new Error(result.error?.message ?? 'IWSDK command failed');
  return result.data?.result ?? result.data;
}
const xr = (name, data) => command('xr', name, '--input-json', JSON.stringify(data));
const probe = () => command('browser', 'run', 'scripts/emu-probe.mjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
let pass = false;
try {
  await command('browser', 'run', 'scripts/emu-open.mjs');
  await command('browser', 'run', 'scripts/emu-enter.mjs');
  const before = await probe(); records.push({ step: 'before', ...before });
  const photo = before.keepsakes.find(k => k.active);
  assert(photo, 'A confirmed photograph with native OneHandGrabbable must exist.');
  await xr('animate-to', { device: 'controller-right', position: { x: photo.center[0], y: photo.center[1], z: photo.center[2] }, duration: .7 });
  await xr('set-gamepad-state', { device: 'controller-right', buttons: [{ index: 1, value: 1 }] });
  const held = await probe(); records.push({ step: 'squeeze', ...held });
  assert(held.keepsakes.some(k => k.id === photo.id && k.held), 'Native Grabbed did not qualify after squeeze.');
  await xr('animate-to', { device: 'controller-right', position: { x: .1, y: 1.45, z: -.8 }, duration: .7 });
  const moved = await probe(); records.push({ step: 'held-movement', ...moved });
  const movedPhoto = moved.keepsakes.find(k => k.id === photo.id);
  assert(movedPhoto.held && Math.hypot(...movedPhoto.position.map((x, i) => x - photo.position[i])) > .3, 'Held photograph must follow the controller.');
  await xr('set-gamepad-state', { device: 'controller-right', buttons: [{ index: 1, value: 0 }] });
  await sleep(1300);
  const released = await probe(); records.push({ step: 'release', ...released });
  const returned = released.keepsakes.find(k => k.id === photo.id);
  assert(!returned.held && Math.hypot(...returned.position.map((x, i) => x - photo.position[i])) < .03, 'Released photograph must return to its remembered placement.');
  await xr('look-at', { device: 'controller-right', target: { x: .2, y: .8, z: -8.5 } });
  await xr('select', { device: 'controller-right', duration: .2 });
  await sleep(700);
  const gate = await probe(); records.push({ step: 'gate-select', ...gate });
  assert(gate.gateOpen === true && gate.placements.find(o => o.label === 'gate')?.interaction?.gateAngle < -.5, 'Trigger selection must open the real gate hinge.');
  assert(gate.tickError === null && gate.xr, 'The immersive renderer must remain active without tick errors.');
  pass = true;
} catch (error) { records.push({ step: 'failure', error: error.message }); process.exitCode = 1; }
finally {
  await xr('set-gamepad-state', { device: 'controller-right', buttons: [{ index: 1, value: 0 }, { index: 0, value: 0 }] }).catch(() => {});
  const output = new URL('../../../evidence/calhacks-exchange/xr-rehearsal.json', import.meta.url);
  mkdirSync(new URL('./', output), { recursive: true });
  writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), environment: 'IWSDK Meta Quest 3 emulator; no physical headset', pass, records }, null, 2));
  console.log(JSON.stringify({ pass, steps: records.map(r => ({ step: r.step, error: r.error, held: r.keepsakes?.[0]?.held, position: r.keepsakes?.[0]?.position, gateOpen: r.gateOpen })) }, null, 2));
}
