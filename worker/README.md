# GPU worker: photo → SHARP splat → SPZ

A long-running **local** process. It turns each queued photo into a 500k-splat SPZ, plus a 250k "lite" SPZ, using
SHARP on a Modal L40S. It runs as an **ephemeral** Modal app (`app.run()`). Nothing is deployed, and the app and its
container stop when the worker exits.

## Start

```sh
# from the practice repo root, with the local Convex backend running and .env.worker present (npm run env:push)
worker/start.sh                    # run until Ctrl-C; the first photo is a cold start (~31 s), later ones ~8-11 s
worker/start.sh --prewarm          # start the GPU container now, so the first photo is warm too
worker/start.sh --prewarm --keep-warm 240 --budget-gpu-s 7200   # demo mode: always warm for up to 2 h (<= ~$3.90)
```

`start.sh` loads **only** `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` from ignored `auth/memory-gate.env` into the
worker's environment, and never prints them. `$MEMORY_GATE_ENV` overrides that path; `$MEMGATE_AUTH_FILE` is a
compatibility alias with lower precedence. It runs `worker/sharp_worker.py` using `worker/.venv`, creating that
environment with `modal==1.6.1` when needed. It runs `npm ci` in `worker/` if `@adobe/spz` is missing. The Convex
URL and `WORKER_SECRET` come from `.env.worker`. This optional worker is not required by the default courtyard.

Options: `--poll 1.5` (seconds between `claimJob` polls), `--max-jobs N`, `--exit-when-idle S`, `--budget-gpu-s 1500`
(estimated billable seconds per process; past it, jobs fail fast to the prebaked splat and keep-warm stops. A
`--keep-warm` session bills every second it runs, so raise the budget to cover the demo window), `--lite 250000`,
`--keep-runs` (keep the files in `worker/.runs/`), `--results file.jsonl` (one JSON line per job).

## What one job does

| Step | Where | Time (warm) |
|---|---|---|
| `splats:claimJob` (HTTP `POST /api/mutation`, every 1.5 s) | local → Convex | <0.1 s, plus up to 1.5 s polling |
| download the photo from Convex storage | local | <0.1 s |
| SHARP `predict_image` | Modal L40S | 3.8 s inference |
| the "decimate" step: the attributes `save_ply` would write, ranked by sigmoid(opacity) × volume (V15 rule); the top 500k come back sorted, as float32 xyz + float16 attributes (~17 MB instead of the 66 MB PLY) | Modal | 0.02 s |
| transfer back | Modal → local | 1.2–1.9 s |
| `worker/spz.mjs raw`: SPZ v3 500k + the lite 250k (a prefix of the same ranking), both read back with `@adobe/spz` to check counts, then the floor estimate | local Node | 2.4–4.1 s |
| upload both via `splats:workerUploadUrl`, then `splats:completeSplat` with `timings` | local → Convex | 0.05–0.25 s |

Any exception calls `splats:failJob`, and the backend attaches the prebaked sample splat at once (otherwise its 150 s
timer does it). Ctrl-C during a job fails that job too. If the GPU step fails twice in a row (for example, the
ephemeral app was stopped after a network drop), the worker leaves the app and opens a fresh one after 10 s, up to
`--max-restarts 5`. Tested with `MEMGATE_SIMULATE_GPU_FAILURES=3`, a no-GPU test hook: `evidence/worker/worker-restarttest.log`. `worker/.heartbeat.json` is rewritten on every poll, and
`npm run doctor` reads it.

**floorY** (y-up frame, negative = below the camera): the lowest strong peak of a 2 cm height histogram of opaque
splats in front of and below the camera, refined with a parabola. SHARP's Gaussians are view-aligned (their thinnest
axis follows the camera ray), so surface normals can't be used. Results: 1938 sample -1.158 (hand value -1.19);
1934 sample -1.54 (a clear peak at 1.50–1.58 m). `scale` is 1, because SHARP output is metric.

## Measured (2026-10-23, practice build; raw data in `evidence/worker/`)

| Run | Photo → splat ready (`worker/e2e.mjs`) | Worker breakdown |
|---|---|---|
| cold (first call, container boot + weights) | **31.3 s** (1938 photo) | gpu wall 25.95 s, of which container work 5.0 s; spz 4.1 s |
| cold, second sample | 38.1 s (1934 photo), including ~8 s of the worker's own startup | worker-side 28.2 s (gpu wall 23.0 s) |
| warm | **10.9 s** (1934 photo), **7.9 s** (1938 photo) | gpu wall 5.0–5.7 s; spz 2.4–4.1 s |
| warm after `--prewarm` | **10.0 s** (1934 photo) | prewarm took 15.2 s at start |
| failure path (`--budget-gpu-s 0`) | prebaked splat after **1.3 s** | no container started |

The 1938 splat from the GPU path matches the V29 PLY path. Positions are identical, colors, scales and alpha differ
by at most one SPZ quantization step at p99, and 88% of splats sit at the identical rank (the rest are near-ties).
All SPZ files read back with the expected counts (500,000 / 250,000; 6.97–7.10 MB / 3.45–3.53 MB).

## Test it offline (no GPU, no network)

```sh
node worker/spz.selftest.mjs   # synthetic room in the container's raw format -> spz.mjs -> counts, lite prefix, read-back, floorY
```

## Test it end to end

```sh
worker/start.sh --max-jobs 2 --exit-when-idle 60 --results worker/.runs/results.jsonl &   # paid: ~$0.05
node worker/e2e.mjs fixtures/sample-photo-1938.jpg --credit "Library of Congress, FSA/OWI, 1938 (no known restrictions)"
node worker/e2e.mjs fixtures/sample-photo-1934.jpg --credit "Library of Congress, FSA/OWI, Elmer S. Johnson, 1934 (no known restrictions)"
```

`e2e.mjs` creates a room, gives `photo_processing` + `vendor_upload_modal` consent, uploads the photo and calls
`addPhoto`. With `splat.live` on, that queues a job. It then waits for **that** splat to be `ready` with source
`sharp`, downloads both SPZ files and reads them back. It exits 1 on a fallback or a count mismatch. The rooms it
creates stay, so their codes can be opened in the headset.

## Look at a result

```sh
worker/start.sh --keep-runs ...   # keeps worker/.runs/job-*/splat.spz
node worker/view-splat.mjs worker/.runs/job-XXXX/splat.spz --floor -1.54 --fpx 851.2 --height 760 --aspect 1.268 --out evidence/worker/splat-1934
```

This renders the SPZ with Spark (headless Chrome) from the photo's own viewpoint, using a vertical FOV computed from
SHARP's `fPx`, and from a side view with a 1 m grid at `floorY`. Tonight's renders are in
`evidence/worker/splat-{1934,1938}-{photo,floor}.png`: the photo view reproduces the photo, and the grid lies on the floor.

## Cost and safety

- L40S is $0.000542/s. The worker logs an estimate on exit: each container session from its first call to its last,
  plus the idle window up to the app's stop. Tonight's tests used ~165 GPU-s in total, about $0.11 (`evidence/spend.md`).
- An ephemeral app's containers stop when the worker exits, so there's no idle bill after `--max-jobs` or Ctrl-C. While it
  runs, the container idles up to `scaledown_window` = 300 s after the last call.
- Never `modal deploy` this. `npm run doctor -- --modal` warns if a Memory Gate app is still running.
- The SHARP weights are research-only (Apple ML Research Model License). The photo goes to Modal only with the room's
  `vendor_upload_modal` consent (`addPhoto` checks it).
