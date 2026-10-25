# Memory Gate Source Atlas

An Apify Actor for finding public historical context around a place and period. It searches the Library of Congress photo catalog, visits a bounded number of item records, and returns source-linked references with dates, rights and uncertainty. It never takes family recordings or private transcripts as input.

Version 1.2 adds bounded Google Maps place discovery alongside selected public Instagram photo posts and the original archive search. The Actor name stays stable so archive deployments keep working. [Photo setup](../../docs/APIFY_MEMORY_SOURCES.md) · [Places and optional 3D objects](../../docs/PLACE_OBJECTS.md).

## Place source mode

```json
{
  "sourceMode": "place",
  "query": "Golden Gate Park, San Francisco"
}
```

The query is a public place or landmark name, 3–120 characters. The Actor starts the official [`compass/crawler-google-places`](https://apify.com/compass/crawler-google-places/api), saves its child run ID before waiting and emits at most three normalized references. Each has a title, address, allowlisted Maps link and coordinates when supplied. It requests no images, reviews, contact enrichment or directories. Unknown coordinates stay null. The child request has a 150-second timeout and `maxTotalChargeUsd: 0.10`; this is not a combined parent/child or account spending guarantee.

Place mode requires an Apify token even locally. It finds references, not GLB meshes. In Memory Gate, the family reviews a reference, chooses an existing original model or a separately approved family photo for image-to-3D, previews the model privately and explicitly places it in a selected memory and POV. The Actor never receives that family photo, note or member token. Search results alone cannot alter the shared scene. Application removal and Apify dataset retention are separate.

Without a published custom Actor ID, the application can call the official Maps Actor directly. With `APIFY_MEMORY_ACTOR_ID` configured, it runs this Actor in place or social mode. Cloud publication and live place/social runs remain unverified because this checkout has no Apify token.

## Social source mode

```json
{
  "sourceMode": "social",
  "postUrls": ["https://www.instagram.com/p/YOUR_POST_CODE/"],
  "permissionConfirmed": true
}
```

Supply one to three explicit public photo-post URLs you have permission to use. Profiles, reels, private login/cookies and discovery of someone's account are outside this contract. The custom Actor starts the official `apify/instagram-scraper`, saves its ID in `CHILD_RUN` before waiting, reads at most 12 post rows, and emits up to eight photo cards. Carousel images keep the parent caption, author, post URL and date. Videos are excluded. Caption words suggest `kite`, `flower` or `landmark`; these suggestions are **not image recognition**. Unknown dates stay null. Run status and the child's ID stay in the output manifest.

Social mode requires an Apify token even when running the Actor locally because its Instagram extraction runs on Apify. The archive mode below can run locally without a token. The child request uses a 120-second timeout and `maxTotalChargeUsd: 0.05`. This is a per-request setting, not a combined guarantee for parent/child compute or account spend. Inspect an existing run before retrying a failure.

Only public URLs and the permission flag enter this Actor. Family notes, member tokens, diagnoses and recordings remain in the application. An imported photo stays a private preview until the family explicitly attaches it. Apify's dataset retention is separate from removal of a source inside Memory Gate.

## Input

Omit `sourceMode` or set it to `archive` for the original archive search:

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
