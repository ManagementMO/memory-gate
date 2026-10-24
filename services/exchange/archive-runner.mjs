import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateInput } from '../../actors/historical-memory-atlas/src/archive.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export async function runArchive(input) {
  input = validateInput(input);
  if (process.env.ATLAS_MODE === 'local') {
    const runId = `local-${randomUUID()}`;
    const storage = path.join(root, '.logs', 'atlas', runId);
    await mkdir(path.join(storage, 'key_value_stores', 'default'), { recursive: true });
    await writeFile(path.join(storage, 'key_value_stores', 'default', 'INPUT.json'), JSON.stringify(input));
    await new Promise((resolve, reject) => {
      // No family data or cloud credential is inherited by the local Actor.
      const child = spawn(process.execPath, ['src/main.mjs'], {
        cwd: path.join(root, 'actors/historical-memory-atlas'), windowsHide: true,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, HOME: process.env.HOME,
          APIFY_LOCAL_STORAGE_DIR: storage, APIFY_PURGE_ON_START: '0', APIFY_DISABLE_OUTDATED_WARNING: '1' },
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error('The archive timed out. Please try again later.')); }, 150_000);
      child.once('error', () => { clearTimeout(timer); reject(new Error('The local Apify Actor could not start.')); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('The archive is unavailable. Your memories have not changed.')); });
    });
    const manifest = JSON.parse(await readFile(path.join(storage, 'key_value_stores', 'default', 'OUTPUT.json'), 'utf8'));
    return { ...manifest, execution: 'apify-local', runId };
  }
  if (process.env.ATLAS_MODE !== 'cloud' || process.env.ALLOW_APIFY_CLOUD !== '1' || !process.env.APIFY_TOKEN || !process.env.APIFY_ACTOR_ID) throw new Error('Archive search is not configured. The operator can enable the local Apify Actor or a budgeted cloud run.');
  const { ApifyClient } = await import('../../actors/historical-memory-atlas/node_modules/apify-client/dist/index.js');
  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
  const run = await client.actor(process.env.APIFY_ACTOR_ID).start(input, { memory: 256, timeout: 150, maxTotalChargeUsd: 0.1 });
  // Save the job before waiting; a timeout is never retried by creating a second run.
  await mkdir(path.join(root, '.logs', 'atlas'), { recursive: true });
  await writeFile(path.join(root, '.logs', 'atlas', `${run.id}.json`), JSON.stringify({ runId: run.id, input }));
  const completed = await client.run(run.id).waitForFinish({ waitSecs: 160 });
  if (completed.status !== 'SUCCEEDED') throw new Error(`Archive run ${run.id} did not finish successfully. Check that run before retrying.`);
  const output = await client.keyValueStore(completed.defaultKeyValueStoreId).getRecord('OUTPUT');
  if (!output?.value || typeof output.value !== 'object') throw new Error('The Actor returned no manifest.');
  return { ...output.value, execution: 'apify-cloud', runId: run.id };
}
