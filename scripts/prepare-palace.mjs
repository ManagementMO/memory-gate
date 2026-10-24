// Offline intake. No network, credentials, media uploads, generation, or room mutations.
import { open, writeFile, mkdir, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parsePalaceCapture, palaceWorldRequest } from '../packages/shared/src/palace.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.logs/palace');
async function readBounded(file, min, max, label) {
  // Nonblocking open also lets fstat reject a FIFO without waiting for a writer.
  const handle = await open(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < min || info.size > max) throw new Error(`${label} must be a regular file between ${min} and ${max} bytes.`);
    const chunks = []; let total = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(65536, max - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > max) throw new Error(`${label} grew beyond its size budget.`);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    if (total < min) throw new Error(`${label} no longer contains enough data.`);
    return Buffer.concat(chunks, total);
  } finally { await handle.close(); }
}
const template = { schema: 'memory-gate.palace-capture/1', title: 'Palace of Fine Arts · together by the lagoon',
  capturePosition: 'Describe one actual land-side standing position and which way the first photo faces.',
  rights: 'Replace with photographer, capture date, permission and source.', reviewedForUpload: false,
  images: [{ file: 'front.jpg' }, { file: 'left.jpg' }, { file: 'right.jpg' }, { file: 'behind.jpg' }], measuredReference: null };

try {
  await mkdir(output, { recursive: true, mode: 0o700 });
  if (process.argv[2] === '--template') {
    const target = path.join(output, 'capture.json');
    await writeFile(target, JSON.stringify(template, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Created ${target}. Put the selected photos beside it, fill in source/review details, then run npm run palace:prepare -- ${target}`);
  } else {
    if (process.argv.length !== 3) throw new Error('Usage: npm run palace:prepare -- /absolute/path/to/capture.json (or --template). No network requests are made.');
    const manifestFile = await realpath(path.resolve(process.argv[2]));
    const manifestBytes = await readBounded(manifestFile, 2, 32768, 'Capture manifest');
    const capture = parsePalaceCapture(JSON.parse(manifestBytes.toString('utf8')));
    const directory = await realpath(path.dirname(manifestFile));
    const images = []; const hashes = new Set(); let total = 0;
    for (const image of capture.images) {
      const file = await realpath(path.join(directory, image.file));
      const relative = path.relative(directory, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('An image symlink leaves the capture folder.');
      const bytes = await readBounded(file, 16, 8_000_000, 'Selected image');
      total += bytes.length; if (total > 24_000_000) throw new Error('The selected capture exceeds 24 MB.');
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isWebp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
      const extension = path.extname(image.file).toLowerCase();
      if (!(isJpeg && ['.jpg', '.jpeg'].includes(extension) || isPng && extension === '.png' || isWebp && extension === '.webp')) throw new Error('An image signature does not match its extension. Export HEIC as JPEG first.');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (hashes.has(sha256)) throw new Error('Two selected files contain the same photo. Choose distinct views.');
      hashes.add(sha256);
      images.push({ ...image, bytes: bytes.length, sha256 });
    }
    const pendingIds = capture.images.map((_, i) => `PENDING_PRIVATE_UPLOAD_${i + 1}`);
    const request = capture.reviewedForUpload ? palaceWorldRequest(capture, pendingIds) : null;
    const report = { schema: 'memory-gate.palace-preparation/1', preparedAt: new Date().toISOString(), mode: 'offline-only', submitted: false,
      capture, images, totalBytes: total, requestTemplate: request,
      pending: ['Normalize images and strip location metadata before any upload.', ...(!capture.reviewedForUpload ? ['Review exact photos and their source/rights before provider upload.'] : []),
        'Upload selected photos privately and replace every PENDING media ID; this tool never uploads.',
        'Use the backend budget/reservation path for a separately authorized generation; this tool grants no allowance.',
        ...(!capture.measuredReference ? ['Measure a visible object before scale acceptance.'] : []),
        'Review the generated world from both eyes and a small head movement before activation.',
        'Author and check land-only collision/navigation separately; generated scenery is not a walkable mesh.'] };
    const target = path.join(output, `prepared-${Date.now()}.json`);
    await writeFile(target, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ report: target, images: images.length, totalBytes: total, reviewedForUpload: capture.reviewedForUpload, requestPrepared: Boolean(request), submitted: false, pending: report.pending }, null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
