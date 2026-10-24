import { Actor } from 'apify';
import { searchArchive } from './archive.mjs';

await Actor.main(async () => {
  const result = await searchArchive(await Actor.getInput());
  if (result.references.length) await Actor.pushData(result.references);
  await Actor.setValue('OUTPUT', { ...result, execution: Actor.isAtHome() ? 'apify-cloud' : 'apify-local', runId: Actor.getEnv().actorRunId ?? null });
  await Actor.setStatusMessage(`Retrieved ${result.references.length} attributed references. Family approval required before use.`);
});
