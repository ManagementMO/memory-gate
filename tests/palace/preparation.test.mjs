import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, copyFile, symlink, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
async function fixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'memory-gate-palace-'));
  await copyFile(path.join(root, 'fixtures/sample-photo-1938.jpg'), path.join(folder, 'front.jpg'));
  await copyFile(path.join(root, 'fixtures/sample-photo-1934.jpg'), path.join(folder, 'side.jpg'));
  const manifest = { schema: 'memory-gate.palace-capture/1', title: 'Offline tool verification', capturePosition: 'Fixture only; these are not Palace photos.',
    rights: 'Existing repository samples, used only for offline intake verification.', reviewedForUpload: false,
    images: [{ file: 'front.jpg' }, { file: 'side.jpg' }], measuredReference: null };
  const file = path.join(folder, 'capture.json');
  await writeFile(file, JSON.stringify(manifest));
  const run = () => exec(process.execPath, ['--experimental-transform-types', 'scripts/prepare-palace.mjs', file], { cwd: root, timeout: 10000 });
  return { folder, manifest, file, run };
}

test('offline capture produces source hashes but never promotes unreviewed photos into a request', async () => {
  const f = await fixture(); let output;
  try {
    const { stdout } = await f.run(); const result = JSON.parse(stdout); output = result.report;
    const report = JSON.parse(await readFile(output, 'utf8'));
    const source = await readFile(path.join(f.folder, 'front.jpg'));
    assert.equal(result.submitted, false); assert.equal(result.requestPrepared, false);
    assert.equal(report.requestTemplate, null); assert.equal(report.mode, 'offline-only');
    assert.equal(report.images[0].sha256, createHash('sha256').update(source).digest('hex'));
    assert.ok(report.pending.some(p => p.includes('Measure')));
  } finally { if (output) await unlink(output); await rm(f.folder, { recursive: true, force: true }); }
});

test('offline capture rejects a symlink escaping the selected photo directory', async () => {
  const f = await fixture();
  try {
    await unlink(path.join(f.folder, 'front.jpg'));
    await symlink(path.join(root, 'fixtures/sample-photo-1938.jpg'), path.join(f.folder, 'front.jpg'));
    await assert.rejects(f.run(), error => error.stderr.includes('symlink leaves'));
  } finally { await rm(f.folder, { recursive: true, force: true }); }
});

test('a photo extension cannot disguise an unsupported file', async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.folder, 'front.jpg'), 'this is not a real jpeg image');
    await assert.rejects(f.run(), error => error.stderr.includes('signature'));
  } finally { await rm(f.folder, { recursive: true, force: true }); }
});

test('renaming one image does not make it two independent capture views', async () => {
  const f = await fixture();
  try {
    await copyFile(path.join(f.folder, 'front.jpg'), path.join(f.folder, 'side.jpg'));
    await assert.rejects(f.run(), error => error.stderr.includes('same photo'));
  } finally { await rm(f.folder, { recursive: true, force: true }); }
});

test('a FIFO cannot hang the manifest reader', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture();
  try {
    await unlink(f.file);
    await exec('mkfifo', [f.file]);
    await assert.rejects(f.run(), error => error.stderr?.includes('regular file'));
  } finally { await rm(f.folder, { recursive: true, force: true }); }
});
