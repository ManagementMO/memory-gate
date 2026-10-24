# Spend log (practice build, 2026-10-23)

Every paid call made for the practice build. Tripo credits are $0.01 each. Modal L40S is $0.000542/s; Modal rows are
estimates from the worker's own timers (container time per call, plus cold start and the 300 s idle scaledown window).

| time (UTC) | provider | what | units | est. USD |
|---|---|---|---|---|
| 2026-10-23T07:09:25.807Z | tripo | text-to-model x7 (lamp, clock, sewing machine, rug, vase with flowers, teapot, rocking chair); 7 ok | 140 credits | $1.40 |
| 2026-10-23T07:22:43Z | modal | SHARP worker e2e: 1 cold + 2 warm jobs on 1 L40S container (worker exited at once, so the app and container stopped; container ~61 s + boot) | ~75 GPU-s (upper bound with a full 300 s idle: 361 s) | ~$0.05 (incl. CPU/RAM; upper bound $0.20) |
| 2026-10-23T07:31:56Z | modal | worker failure-path test (--budget-gpu-s 0): no container started | 0 GPU-s | $0.00 |
| 2026-10-23T07:33:46Z | modal | worker --prewarm --keep-warm 25: prewarm + 1 ping + 1 warm job, then exit (app and container stopped) | ~63 GPU-s (session 1.1–60.7 s + boot) | ~$0.04 (incl. CPU/RAM) |
| 2026-10-23T07:45:55Z | modal | worker restart-path test (MEMGATE_SIMULATE_GPU_FAILURES=3): 2 apps created, no container started | 0 GPU-s | $0.00 |
| 2026-10-23T07:47:11Z | modal | worker regression run after the restart refactor: 1 cold job, then exit | ~35 GPU-s | ~$0.02 |
