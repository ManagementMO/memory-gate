# Heirloom Historical Memory Atlas

An Apify Actor for finding public historical context around a place and period. It searches the Library of Congress photo catalog, visits a bounded number of item records, and returns source-linked references with dates, rights and uncertainty. It never takes family recordings or private transcripts as input.

## Input

```json
{
  "place": "San Francisco",
  "yearFrom": 1900,
  "yearTo": 1980,
  "terms": "street",
  "maxItems": 4
}
```

Place is 2–100 characters; optional details are at most 100. Years must be ordered integers between 1000 and 2100. `maxItems` is 1–8. The Actor makes at most nine catalog/detail requests, caps response bodies at 3 MB, uses request timeouts, rejects redirects and accepts only allowlisted institutional URLs. Known dates outside the requested interval are excluded; unknown dates stay explicitly labeled.

## Output

The default dataset contains one row per reference. The default key-value store's `OUTPUT` record includes the normalized input, retrieval time, execution mode, run ID, warnings and references. Each reference includes:

- Title, publisher, catalog date, description and institutional source URL.
- Exact available rights wording, retrieval timestamp and `public-archive` provenance.
- Date match/uncertainty text that separates contextual records from a person's recollection.
- An image URL only when the record provides an explicit public-domain/no-known-restrictions statement without conditional exceptions. Otherwise users get a source link. This conservative display rule is not a legal clearance opinion.

## Run locally

Install Node 24 and dependencies with `npm ci` in this directory. `npm test` runs the offline contract tests. For the full application, `npm run local:up` at the repository root enables the Actor in the gateway. It supplies `CRAWLEE_STORAGE_DIR` per run and sets `CRAWLEE_PURGE_ON_START=false` so the input is retained. Public internet access to `www.loc.gov` is required. No Apify token or cloud spend is required for local execution.

## Deploy to Apify

The folder is self-contained, with a Dockerfile and `.actor/` input/output schemas. Using the [official deployment workflow](https://docs.apify.com/actors/development/deployment), log in with the Apify CLI, enter this folder, and run `apify push`. Save the resulting Actor ID. This branch has **not** been cloud-deployed: no Apify credential was found in the supplied attachments.

To connect an explicitly enabled cloud Actor, set `ATLAS_MODE=cloud`, `ALLOW_APIFY_CLOUD=1`, `APIFY_TOKEN` and `APIFY_ACTOR_ID` in the application's ignored `.env.exchange`, then restart the gateway. Never put the token in frontend code. The adapter supplies a 150-second timeout, 256 MB memory and `maxTotalChargeUsd: 0.1`, and records the cloud run ID before waiting. These request settings are not a reconciled account-level spending guarantee. Check the existing run before retrying a failure.

The application never auto-pins results, imports private content into the Actor, or changes the 3D scene on the strength of a search result. People choose a source before it appears on the shared board.
