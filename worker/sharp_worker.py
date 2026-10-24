"""Memory Gate GPU worker: photo -> SHARP Gaussian splat -> 500k SPZ (+ 250k lite) -> Convex.

A long-running LOCAL process. It opens an EPHEMERAL Modal app (`app.run()`, never `modal deploy`), so nothing stays
in the cloud after it exits; while it runs, one L40S container stays warm for `scaledown_window` seconds after each
job. Every 1.5 s it asks Convex for a queued splat job (splats:claimJob, WORKER_SECRET-guarded), then:

  download   the photo from Convex storage
  gpu        SHARP on Modal (V29). The container also does the "decimate" step: the same per-splat attributes
             save_ply would write, ranked by sigmoid(opacity) x volume (V15 rule), top 500k shipped back as
             float32 positions + float16 attributes (~17 MB instead of the 66 MB PLY)
  spz        worker/spz.mjs (@adobe/spz WASM): SPZ v3 500k + lite 250k, read back to check counts, floor estimate
  upload     both files via splats:workerUploadUrl, then splats:completeSplat with the timings

Any failure calls splats:failJob (the backend then attaches the prebaked sample splat). Start it with worker/start.sh
(see worker/README.md). The SHARP weights are research-only (Apple ML Research Model License).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
import time
import traceback
import urllib.error
import urllib.request
from pathlib import Path

import modal

# ---------------------------------------------------------------------------------------------------------------
# Modal side. The image is defined exactly like the V29 spike so its layers come from Modal's build cache.
# ---------------------------------------------------------------------------------------------------------------
SHARP_REPO = "https://github.com/apple-aiml-research/ml-sharp.git"
SHARP_SHA = "aed6527499ef91cba3b54c18d49a870f25947190"
CKPT_URL = "https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt"
CKPT = "/weights/sharp_2572gikvuh.pt"
KEEP = 500_000
SCALEDOWN_S = 300

image = (
    modal.Image.debian_slim(python_version="3.13")
    .apt_install("git", "curl")
    .run_commands(f"mkdir -p /weights && curl -fL --retry 3 -o {CKPT} {CKPT_URL}")
    .run_commands(
        f"git clone {SHARP_REPO} /opt/ml-sharp",
        f"cd /opt/ml-sharp && git checkout {SHARP_SHA}",
        "cd /opt/ml-sharp && pip install -r requirements.txt",
    )
)
app = modal.App("memgate-sharp-worker", image=image)

with image.imports():
    import torch


@app.cls(gpu=["L40S", "A100-40GB", "A10"], cpu=4.0, memory=16384, timeout=600, scaledown_window=SCALEDOWN_S)
class Sharp:
    @modal.enter()
    def load(self):
        t = time.time()
        from sharp.models import PredictorParams, create_predictor

        self.device = torch.device("cuda")
        model = create_predictor(PredictorParams())
        model.load_state_dict(torch.load(CKPT, weights_only=True, map_location="cpu"))
        self.model = model.eval().to(self.device)
        self.load_seconds = round(time.time() - t, 2)
        self.gpu = torch.cuda.get_device_name(0)
        self.started = time.time()
        self.calls = 0

    @modal.method()
    def ping(self) -> dict:
        self.calls += 1
        return {"gpu": self.gpu, "model_load_s": self.load_seconds, "container_age_s": round(time.time() - self.started, 1),
                "first_call": self.calls == 1}

    @modal.method()
    def predict(self, image_bytes: bytes, keep: int = KEEP) -> dict:
        import tempfile as tf

        from sharp.cli.predict import predict_image
        from sharp.utils import color_space as cs_utils
        from sharp.utils import io as sio
        from sharp.utils.gaussians import convert_rgb_to_spherical_harmonics

        t0 = time.time()
        self.calls += 1
        first_call = self.calls == 1
        with tf.TemporaryDirectory() as d:  # nothing persisted
            src = Path(d) / "input.jpg"
            src.write_bytes(image_bytes)
            img, _, f_px = sio.load_rgb(src)
        torch.cuda.synchronize()
        t1 = time.time()
        with torch.no_grad():
            g = predict_image(self.model, img, f_px, self.device)
            torch.cuda.synchronize()
            t2 = time.time()
            # The per-splat attributes exactly as sharp.utils.gaussians.save_ply computes them (PLY vertex order:
            # x y z f_dc_0..2 opacity scale_0..2 rot_0..3), minus its slow row-by-row PLY writer (2.9 s, V29).
            xyz = g.mean_vectors.flatten(0, 1).float()
            colors = convert_rgb_to_spherical_harmonics(cs_utils.linearRGB2sRGB(g.colors.flatten(0, 1))).float()
            op = g.opacities.flatten(0, 1).float()
            opacity_logits = torch.log(op / (1.0 - op)).clamp(-20.0, 20.0).unsqueeze(-1)
            scale_logits = torch.log(g.singular_values.flatten(0, 1).float())
            quats = g.quaternions.flatten(0, 1).float()
            attrs = torch.cat((xyz, colors, opacity_logits, scale_logits, quats), dim=1)
            n_total = attrs.shape[0]
            finite = torch.isfinite(attrs).all(dim=1)
            score = op * torch.exp(scale_logits.sum(dim=1))  # sigmoid(opacity) x volume, the V15 importance rule
            score = torch.where(finite & torch.isfinite(score), score, torch.full_like(score, -1.0))
            k = int(min(keep, int(finite.sum().item())))
            top = torch.topk(score, k, sorted=True).indices  # best first, so the lite file is a prefix
            sel = attrs[top]
            pos = sel[:, :3].contiguous().cpu().numpy().astype("<f4").tobytes()
            rest = sel[:, 3:].contiguous().cpu().numpy().astype("<f2").tobytes()
            depth = sel[:, 2]
            near_far = torch.quantile(depth[: min(k, 200_000)], torch.tensor([0.02, 0.98], device=depth.device)).tolist()
        t3 = time.time()
        h, w = img.shape[:2]
        return {
            "pos": pos, "rest": rest, "n": k, "n_total": int(n_total), "n_nonfinite": int(n_total - int(finite.sum().item())),
            "f_px": float(f_px), "width": int(w), "height": int(h), "near_depth": round(near_far[0], 3), "far_depth": round(near_far[1], 3),
            "gpu": self.gpu, "first_call": first_call, "model_load_s": self.load_seconds,
            "load_image_s": round(t1 - t0, 3), "inference_s": round(t2 - t1, 3), "decimate_s": round(t3 - t2, 3), "container_s": round(t3 - t0, 3),
        }


# ---------------------------------------------------------------------------------------------------------------
# Local side: Convex polling, SPZ step, uploads. Only runs on this machine (never inside the container).
# ---------------------------------------------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
REPO = HERE.parent
RUNS = HERE / ".runs"
HEARTBEAT = HERE / ".heartbeat.json"
L40S_USD_PER_S = 0.000542


def log(msg: str, **kv) -> None:
    extra = " ".join(f"{k}={v}" for k, v in kv.items())
    print(f"[worker {time.strftime('%H:%M:%S')}] {msg} {extra}".rstrip(), flush=True)


def load_worker_env() -> dict:
    p = REPO / ".env.worker"
    env = {}
    for line in p.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    for k in ("CONVEX_URL", "WORKER_SECRET"):
        if not env.get(k):
            raise SystemExit(f"{p} is missing {k} (run `npm run env:push` first)")
    return env


class Convex:
    """Minimal Convex HTTP API client: POST /api/{mutation|query} -> {"status": "success", "value": ...}."""

    def __init__(self, url: str, secret: str):
        self.url, self.secret = url.rstrip("/"), secret

    def _call(self, kind: str, path: str, args: dict, timeout: float = 20):
        body = json.dumps({"path": path, "args": {"secret": self.secret, **args}, "format": "json"}).encode()
        req = urllib.request.Request(f"{self.url}/api/{kind}", data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            out = json.loads(r.read())
        if out.get("status") != "success":
            msg = out.get("errorData") or out.get("errorMessage") or out
            raise RuntimeError(f"convex {path}: {str(msg)[:300]}".replace(self.secret, "<redacted>"))
        return out.get("value")

    def mutation(self, path: str, args: dict, timeout: float = 20):
        return self._call("mutation", path, args, timeout)

    def upload(self, data: bytes, content_type: str = "application/octet-stream") -> str:
        url = self.mutation("splats:workerUploadUrl", {})
        req = urllib.request.Request(url, data=data, headers={"Content-Type": content_type}, method="POST")
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())["storageId"]


def fetch(url: str, timeout: float = 60) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def heartbeat(state: str, **extra) -> None:
    try:
        HEARTBEAT.write_text(json.dumps({"at": time.time(), "pid": os.getpid(), "state": state, **extra}))
    except OSError:
        pass


class GpuLedger:
    """Estimates billable container time per container session: from the first call's start (which includes the
    cold boot and weights load) to the last call's end, plus the idle scaledown window after it. The worker refuses
    GPU work past --budget-gpu-s (the job fails fast and the backend attaches the prebaked splat)."""

    def __init__(self, budget_s: float):
        self.budget_s = budget_s
        self.sessions: list[list[float]] = []  # [wall start, wall end] per container

    def record(self, first_call: bool, wall_start: float, wall_end: float) -> None:
        if first_call or not self.sessions or wall_start - self.sessions[-1][1] > SCALEDOWN_S:
            self.sessions.append([wall_start, wall_end])
        else:
            self.sessions[-1][1] = wall_end

    @property
    def containers(self) -> int:
        return len(self.sessions)

    def estimate_s(self, stopped_at: float | None = None) -> float:
        """Upper bound while running (full idle window); pass the app's stop time once it has stopped, because an
        ephemeral app's containers stop with it (tonight's first test: 3 jobs, exit right after, ~61 s of container time)."""
        tail = lambda end: SCALEDOWN_S if stopped_at is None else max(0.0, min(SCALEDOWN_S, stopped_at - end))  # noqa: E731
        return sum(end - start + tail(end) for start, end in self.sessions)

    def over(self) -> bool:
        return self.estimate_s() >= self.budget_s


def run_spz(r: dict, workdir: Path, lite: int) -> dict:
    pos, rest = workdir / "pos.f32", workdir / "rest.f16"
    pos.write_bytes(r["pos"])
    rest.write_bytes(r["rest"])
    p = subprocess.run(["node", str(HERE / "spz.mjs"), "raw", str(pos), str(rest), str(workdir), str(lite)],
                       capture_output=True, text=True, timeout=180)
    lines = [l for l in p.stdout.splitlines() if l.startswith("{")]
    if p.returncode != 0 or not lines:
        raise RuntimeError(f"spz.mjs failed ({p.returncode}): {(p.stderr or p.stdout)[-300:]}")
    return json.loads(lines[-1])


_SIMULATED_GPU_FAILURES = {"left": int(os.environ.get("MEMGATE_SIMULATE_GPU_FAILURES", "0") or 0)}  # test hook (no GPU)


def process(job: dict, sharp, cvx: Convex, ledger: GpuLedger, lite: int, keep_runs: bool) -> dict:
    t_start = time.time()
    timings: dict = {}
    stage = "budget"
    job_id = job["jobId"]
    log("claimed", job=job_id, splat=job.get("splatId"))
    heartbeat("busy", jobId=job_id)
    workdir = Path(tempfile.mkdtemp(prefix="job-", dir=RUNS))
    try:
        if ledger.over():
            raise RuntimeError(f"GPU budget reached (~{ledger.estimate_s():.0f}s of {ledger.budget_s:.0f}s); prebaked splat instead")
        stage = "download"
        if not job.get("photoUrl"):
            raise RuntimeError("job has no photo URL")
        t = time.time()
        photo = fetch(job["photoUrl"])
        timings["download"] = round(time.time() - t, 2)

        stage = "gpu"
        t = time.time()
        if _SIMULATED_GPU_FAILURES["left"] > 0:
            _SIMULATED_GPU_FAILURES["left"] -= 1
            raise ConnectionError("simulated GPU failure (MEMGATE_SIMULATE_GPU_FAILURES)")
        r = sharp.predict.remote(photo, KEEP)
        t_gpu_end = time.time()
        timings["gpu"] = round(t_gpu_end - t, 2)  # remote wall: queue/cold start + container work + transfer
        ledger.record(bool(r["first_call"]), t, t_gpu_end)
        timings["gpuContainer"] = r["container_s"]
        timings["inference"] = r["inference_s"]
        timings["decimate"] = r["decimate_s"]
        timings["transfer"] = round(timings["gpu"] - r["container_s"], 2)
        timings["cold"] = bool(r["first_call"])

        stage = "spz"
        t = time.time()
        s = run_spz(r, workdir, lite)
        timings["spz"] = round(time.time() - t, 2)

        stage = "upload"
        t = time.time()
        main_bytes = Path(s["files"]["main"]).read_bytes()
        lite_bytes = Path(s["files"]["lite"]).read_bytes()
        file_id = cvx.upload(main_bytes)
        lite_id = cvx.upload(lite_bytes)
        timings["upload"] = round(time.time() - t, 2)
        timings["total"] = round(time.time() - t_start, 2)

        floor_y = s["floor"].get("floorY")
        args = {
            "jobId": job_id, "fileId": file_id, "liteFileId": lite_id, "numSplats": s["numSplats"], "bytes": s["bytes"],
            "gpuSeconds": r["container_s"], "fPx": r["f_px"], "scale": 1,
            "timings": {**timings, "gpuName": r["gpu"], "inputSplats": r["n_total"], "liteSplats": s["liteSplats"], "liteBytes": s["liteBytes"],
                        "floor": s["floor"], "nearDepth": r["near_depth"], "farDepth": r["far_depth"], "spzMs": s["ms"]},
        }
        if floor_y is not None:
            args["floorY"] = floor_y
        res = cvx.mutation("splats:completeSplat", args)
        out = {"ok": True, "late": bool(res and res.get("late")), "jobId": job_id, "numSplats": s["numSplats"], "bytes": s["bytes"],
               "liteBytes": s["liteBytes"], "floorY": floor_y, "fPx": round(r["f_px"], 1), "gpu": r["gpu"], "timings": timings,
               "gpuEstimateS": round(ledger.estimate_s(), 1)}
        log("done", **{k: v for k, v in out.items() if k in ("jobId", "numSplats", "bytes", "floorY", "late")}, total=timings["total"],
            gpu=timings["gpu"], cold=timings["cold"])
        return out
    except Exception as e:  # noqa: BLE001 - any failure falls back to the prebaked splat
        err = f"{type(e).__name__}: {e}"[:280]
        log("FAILED", job=job_id, error=err)
        traceback.print_exc()
        try:
            cvx.mutation("splats:failJob", {"jobId": job_id, "error": err})
        except Exception as e2:  # noqa: BLE001
            log("failJob also failed", error=str(e2)[:200])
        return {"ok": False, "jobId": job_id, "stage": stage, "error": err, "timings": timings}
    finally:
        if not keep_runs:
            for f in workdir.glob("*"):
                f.unlink(missing_ok=True)
            workdir.rmdir()
        heartbeat("idle", lastJob=job_id, gpuEstimateS=round(ledger.estimate_s(), 1))


def serve(a, cvx: Convex, ledger: GpuLedger, st: dict) -> str:
    """One ephemeral Modal app's lifetime. Returns "done" (max jobs / idle exit) or "restart" (the GPU side failed
    twice in a row, e.g. the app was stopped after a network drop: re-entering app.run() makes a fresh app)."""
    gpu_failures = 0
    with app.run():
        sharp = Sharp()
        if a.prewarm or a.keep_warm:  # also after a restart: the new app gets a warm container again
            t = time.time()
            try:
                info = sharp.ping.remote()
                ledger.record(bool(info.get("first_call")), t, time.time())
                log("prewarmed", wall_s=round(time.time() - t, 1), **info)
            except Exception as e:  # noqa: BLE001
                log("prewarm failed", error=str(e)[:160])
                return "restart"
        heartbeat("idle")
        while True:
            try:
                job = cvx.mutation("splats:claimJob", {"kinds": ["splat"]})
            except (urllib.error.URLError, TimeoutError, RuntimeError, OSError) as e:
                log("claimJob failed; retrying", error=str(e)[:160])
                heartbeat("convex-unreachable")
                time.sleep(max(a.poll, 3))
                continue
            if not job:
                heartbeat("idle", gpuEstimateS=round(ledger.estimate_s(), 1))
                if a.keep_warm and ledger.sessions and time.time() - ledger.sessions[-1][1] > a.keep_warm and not ledger.over():
                    t = time.time()
                    try:
                        info = sharp.ping.remote()
                        ledger.record(bool(info.get("first_call")), t, time.time())
                        log("keep-warm ping", wall_s=round(time.time() - t, 1), container_age_s=info.get("container_age_s"), gpu_estimate_s=round(ledger.estimate_s(), 1))
                    except Exception as e:  # noqa: BLE001
                        log("keep-warm ping failed", error=str(e)[:160])
                        return "restart"
                if a.exit_when_idle and time.time() - st["last_job"] > a.exit_when_idle:
                    log("idle; exiting")
                    return "done"
                time.sleep(a.poll)
                continue
            if job.get("kind") != "splat":
                cvx.mutation("splats:failJob", {"jobId": job["jobId"], "error": f"worker does not handle kind {job.get('kind')}"})
                continue
            try:
                out = process(job, sharp, cvx, ledger, a.lite, a.keep_runs)
            except KeyboardInterrupt:
                log("interrupted during a job; failing it so the prebaked splat attaches now", job=job["jobId"])
                cvx.mutation("splats:failJob", {"jobId": job["jobId"], "error": "worker stopped (Ctrl-C)"})
                raise
            st["last_job"] = time.time()
            if a.results:
                with open(a.results, "a") as f:
                    f.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **out}) + "\n")
            st["done"] += 1
            gpu_failures = gpu_failures + 1 if out.get("stage") == "gpu" else 0
            if a.max_jobs and st["done"] >= a.max_jobs:
                log("max jobs reached; exiting")
                return "done"
            if gpu_failures >= 2:
                log("GPU calls failed twice in a row; restarting the Modal app")
                return "restart"


def main() -> None:
    ap = argparse.ArgumentParser(description="Memory Gate SHARP worker (local; ephemeral Modal app)")
    ap.add_argument("--poll", type=float, default=1.5, help="seconds between claimJob polls")
    ap.add_argument("--prewarm", action="store_true", help="start the GPU container now (costs ~35 s + idle window)")
    ap.add_argument("--keep-warm", type=float, default=0, metavar="S",
                    help="while idle, ping the GPU container every S seconds (< 300) so it never scales down; ~$1.95/h on L40S")
    ap.add_argument("--max-jobs", type=int, default=0, help="exit after this many jobs (0 = run until Ctrl-C)")
    ap.add_argument("--exit-when-idle", type=float, default=0, help="exit after this many seconds with no job (0 = never)")
    ap.add_argument("--budget-gpu-s", type=float, default=float(os.environ.get("MEMGATE_GPU_BUDGET_S", "1500")),
                    help="estimated billable GPU seconds this process may use (default 1500 s, about $0.81 on L40S)")
    ap.add_argument("--lite", type=int, default=250_000, help="splats in the lite SPZ")
    ap.add_argument("--keep-runs", action="store_true", help="keep intermediate files in worker/.runs/")
    ap.add_argument("--results", default="", help="append one JSON line per job to this file")
    ap.add_argument("--max-restarts", type=int, default=5, help="give up after this many Modal app restarts")
    a = ap.parse_args()

    env = load_worker_env()
    cvx = Convex(env["CONVEX_URL"], env["WORKER_SECRET"])
    RUNS.mkdir(exist_ok=True)
    ledger = GpuLedger(a.budget_gpu_s)
    started = time.time()
    st = {"done": 0, "last_job": time.time(), "restarts": 0}
    log("starting", convex=env["CONVEX_URL"], budget_gpu_s=a.budget_gpu_s, prewarm=a.prewarm)
    heartbeat("starting")
    with modal.enable_output():
        while True:
            try:
                reason = serve(a, cvx, ledger, st)
            except KeyboardInterrupt:
                raise
            except Exception as e:  # noqa: BLE001 - e.g. the app could not start (no network)
                log("Modal app error", error=f"{type(e).__name__}: {e}"[:200])
                reason = "restart"
            if reason != "restart":
                break
            st["restarts"] += 1
            if st["restarts"] > a.max_restarts:
                log("too many Modal restarts; exiting (jobs fall back to the prebaked splat)")
                break
            heartbeat("restarting", restarts=st["restarts"])
            log("restarting the Modal app in 10 s", restarts=st["restarts"])
            time.sleep(10)
    est = ledger.estimate_s(stopped_at=time.time())
    log("stopped", jobs=st["done"], restarts=st["restarts"], gpu_estimate_s=round(est, 1), est_usd=round(est * L40S_USD_PER_S, 3), wall_s=round(time.time() - started, 1))
    heartbeat("stopped", gpuEstimateS=round(est, 1))
    print(json.dumps({"summary": {"jobs": st["done"], "restarts": st["restarts"], "gpuEstimateS": round(est, 1), "estUsd": round(est * L40S_USD_PER_S, 3),
                                  "containers": ledger.containers, "sessions": [[round(b - started, 1), round(e - started, 1)] for b, e in ledger.sessions]}}), flush=True)


if __name__ == "__main__":
    main()
