# Verified stack

Versions below come from the checked package manifests and lockfiles on October 23, 2026.

| Component | Version / selected model |
|---|---|
| Node used for review | 22.22.3 |
| TypeScript | 5.9.3 |
| Convex client/backend | 1.46.0 |
| Anthropic official SDK | 0.132.1 |
| Zod direct dependency | 4.6.7 |
| React / React DOM | 19.3.0 |
| Phone Vite | 8.3.4 |
| Headset Vite | 7.3.7 |
| IWSDK core / CLI / Vite plugin | 1.0.1 |
| Compatible Three package | three alias to super-three 0.181.0 |
| Spark | 2.4.0 |
| Playwright | 1.64.0 |
| Vitest / convex-test | 5.0.3 / 0.0.61 |
| Ordinary interpretation | claude-sonnet-5-5 |
| Speech recognition | Cartesia ink-2, manual-finalize WebSocket |
| Companion speech | sonic-3.6-2026-08-27, stock voice; no cloning |
| World generation | marble-1.1, private ordinary-image generation |
| Prepared generated-world detail | 100k SPZ default; cached 500k option |

Use npm ci in the root, apps/phone and apps/headset. Keep their lockfiles. The IWSDK scaffold pins the rendering stack; do not independently upgrade Three/Spark without a rendering and native-interaction regression pass.

Official references used in implementation include [World Labs upload](https://docs.worldlabs.ai/api/reference/media-assets/prepare-upload), [models](https://docs.worldlabs.ai/api/models), [pricing](https://docs.worldlabs.ai/api/pricing), [SPZ conversion](https://docs.worldlabs.ai/api/rendering-spz), [IWSDK testing](https://iwsdk.dev/guides/02-testing-experience.html), and [Playwright video lifecycle](https://playwright.dev/docs/videos). Context7 supplied library documentation until its quota was reached; the video lifecycle was checked directly in official documentation.

The provider metadata actually returned matters more than an example response. The live API used world_id rather than the example's id; both are supported. The draft response returned null semantics metadata despite general documentation describing it as populated. Standard Marble 1.1 returned metric data and was loaded successfully.
