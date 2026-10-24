# Heirloom: a story someone else can hold

This exchange work is now integrated into main alongside the cached World Labs story courtyard. [DEMO_SCRIPT.md](../DEMO_SCRIPT.md) covers live scene formation, and [ORBIS_AND_PALACE.md](ORBIS_AND_PALACE.md) covers the next Palace direction. The Windows results below remain evidence of that branch's run; the combined macOS verification is recorded in MORNING_REPORT.md and evidence/integrated-palace/.

Branch: `codex/calhacks-apify-spacetime-meta`. The new **Memories** tab connects original stories, an explicit recipient choice, and public historical references. All three parts run locally. This branch retains the project's pre-event history; ask organizers about eligibility before submitting.

## What each track actually does

| Track | Implementation | Evidence boundary |
|---|---|---|
| Apify | A custom Actor retrieves bounded Library of Congress photo records, stores a dataset and retrieval manifest, and supplies the reference picker. | Actual Apify SDK local runs and the browser search → select → shared board flow passed. No Apify token was found in the supplied notes; cloud deployment/run is still pending. |
| SpacetimeDB | Authoritative private tables and transactional reducers own memory delivery/acceptance/revocation and the shared reference board. Subscriptions update both participants. | Actual 2.13.0 database, gateway authorization tests, and database/gateway restart persistence passed. Existing capture, media and scene editing remain in Convex. This is not a complete backend migration; confirm the sponsor's “core backend” criterion with them. |
| Meta | Existing IWSDK Quest experience: illustrative garden, shared placement proposals, original-source replay, controller gate and keepsake interaction. The new phone collection complements that experience. | Typecheck and production build passed. The current Windows managed Chromium launch failed; historical emulator evidence is labeled separately. Physical Quest, comfort and performance still require a wearer. |

## Start on Windows, macOS or Linux

Use Node 24 and install the [SpacetimeDB CLI](https://spacetimedb.com/docs/) at version 2.13.0. Commands below run from the repository root:

```sh
npm ci
npm --prefix apps/phone ci
npm --prefix apps/headset ci
npm --prefix actors/historical-memory-atlas ci
npm --prefix spacetimedb ci
npx playwright install chromium
npm run local:up
npm run demo:links
```

If the CLI is not on PATH, put `SPACETIME_BIN=/absolute/path/to/spacetime` in ignored `.env.exchange`; Windows can use a forward-slash path ending in `spacetimedb-cli.exe`. `local:up` launches hidden background processes, publishes only to loopback without a destructive migration flag, preserves existing records, enables the local Actor, seeds the original assets if absent, and starts HTTP/HTTPS phone plus the production Quest preview. It does not activate paid AI, GPU, speech or world-generation services.

The startup command derives exact phone origins from this computer's network interfaces. If using a tunnel or different hostname, set a comma-separated `EXCHANGE_ORIGINS` in `.env.exchange`, then restart the gateway. An already-running gateway retains its previous environment. Keep the publishing token in `.spacetime/config/cli.toml` or `SPACETIME_TOKEN` on the server. Never use a `VITE_` variable for a secret.

| Service | Local address | Logs |
|---|---|---|
| Phone, keyboard | http://localhost:5173 | `.logs/phone.log` |
| Phone, microphone | https://localhost:5174 | `.logs/phone-https.log` |
| Quest / spectator, production | https://localhost:4173 | `.logs/headset-preview.log` |
| Convex | http://127.0.0.1:3210 | `.logs/convex.log` |
| SpacetimeDB | http://127.0.0.1:3000 | `.logs/spacetime.log` |
| Exchange health | http://127.0.0.1:3212/health | `.logs/exchange.log` |

`npm run demo:links` prints current participant links, including the private family key. Use the printed Wi-Fi addresses on phones/Quest, accept the local HTTPS certificate, and keep the computer awake. Do not publish those family links. Use separate browser profiles or two devices for separate participants. `.logs/*.pid` identifies processes launched by the startup command; verify ownership before stopping a process. Local services do not survive a reboot automatically.

## Two-minute demonstration

1. **0:00 — A place to remember.** Open the illustrative garden and two phones in the same family room. Say: “A story should stay in the person's own words, and they should choose who carries it.” Label the demonstration fictional. Quest is optional until the physical checklist passes.
2. **0:20 — Their words, their choice.** Type a short story on Story. With paid services off, the deterministic interpreter is visibly labeled mock. On Memories choose that completed story, give it a title, select the other person, and press **Pass this memory**.
3. **0:45 — An invitation, not an interruption.** The other phone receives the envelope. Press **Accept memory**, then **Open memory**. Show the original text and speaker. Typed input explicitly says no recording was made. Audio appears only when an original recording and current permission exist.
4. **1:10 — The world around it.** Search public place **San Francisco**, **1900–1980**, details **street**. Expand the Apify run details; show the institutional source, date uncertainty and image rights. Say: “These records give us context. They do not prove anyone's recollection.”
5. **1:35 — Choose together.** Press **Use as a shared reference**. Watch it appear on the other phone. Reload: the accepted memory and board remain in SpacetimeDB. Nothing automatically rewrites the story or inserts an archive image into the 3D scene.
6. **1:50 — Control stays with people.** Revoke the handoff from the sender's “Memories you passed” section. The recipient's open memory closes. Explain that room deletion also erases exchange records through reconciliation.

For an offline presentation, keep a previously chosen board item and show the recorded local-run manifest. Say clearly that it is a prior run. Fixture-only rooms deliberately disable archive requests. Do not relabel cached data as a fresh scrape or local execution as an Apify cloud run.

## Verify and inspect

```sh
npm test
npm run test:headset
npm run test:atlas
npm run typecheck
npm --prefix apps/phone run typecheck
npm --prefix apps/headset run typecheck
npm --prefix spacetimedb run typecheck
npm --prefix apps/phone run build
npm --prefix apps/headset run build
npm run test:exchange
npm run test:exchange:browser
```

Integration tests need `local:up` first. The archive browser case is opt-in because it requests public internet data. PowerShell: `$env:E2E_ARCHIVE='1'; npm run test:exchange:browser`. POSIX: `E2E_ARCHIVE=1 npm run test:exchange:browser`. Use `ATLAS_MODE=local` for that test. Provider-only tests remain opt-in; do not enable live services merely to turn skipped tests green.

The existing full browser suite is `npm run e2e`. To use the production 3D server, set `HEADSET_URL=https://localhost:4173`. Native controller rehearsal uses the managed IWSDK browser and `npm run test:xr`; it is separate from browser scene tests and physical Quest verification.

Restart rehearsal: after the real archive test, run `node --import tsx tests/exchange/persistence.mjs prepare`, restart the local database using the same `.spacetime` directory, then run the script with `database-restart`. Restart the gateway and run it with `gateway-restart`. The fixture sessions stay in ignored `.logs/`; only the boolean verification report is committed.

## Privacy and operational limits

- Capsules contain source IDs, participant IDs and a short user-authored title. The original transcript/audio remains in Convex; every open rechecks permission. Private database tables are readable only by the publisher; only the authenticated gateway may call reducers.
- The gateway rechecks current membership and sharing consent on actions and every five seconds. Recording revocation removes an open audio player. Files already downloaded cannot be recalled.
- Deleting a Convex room causes the gateway to purge its SpacetimeDB capsules and references, normally within ten seconds. The server-only absence query uses the existing `WORKER_SECRET`. Reconciliation also runs on connection and retries after outages. Backups and already-downloaded files are outside that live deletion guarantee.
- A room supports 200 handoffs and 40 references; archive searches use a global single-run limit and a per-room cooldown. A failed search leaves existing memories intact. Local rows are not a production identity/tenant deployment.
- The SDK gateway currently subscribes to all private rows and filters per participant. For larger deployments, add scoped subscriptions, operational monitoring, account authentication and a retention policy. Deploy the WebSocket gateway on a persistent server; a static frontend alone is insufficient.
- No new paid generations were made. Existing World Labs limits were preserved. No cloud app deployment, Actor Store publication or hackathon submission was performed.

See [the Actor README](../actors/historical-memory-atlas/README.md), [current verification](../evidence/calhacks-exchange/README.md), and [physical Quest checklist](QUEST_CHECKLIST.md).
