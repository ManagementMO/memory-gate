import { Actor } from 'apify';
import { searchArchive } from './archive.mjs';
import { collectSocial } from './social.mjs';

await Actor.main(async () => {
  const input = await Actor.getInput();
  const result = input?.sourceMode === 'social'
    ? await collectSocial(input, Actor.apifyClient, childRunId => Actor.setValue('CHILD_RUN', { childRunId }))
    : await searchArchive(input);
  if (result.references.length) await Actor.pushData(result.references);
  await Actor.setValue('OUTPUT', { ...result, execution: Actor.isAtHome() ? 'apify-cloud' : 'apify-local', runId: Actor.getEnv().actorRunId ?? null });
  await Actor.setStatusMessage(`Retrieved ${result.references.length} attributed references. Family approval required before use.`);
});
