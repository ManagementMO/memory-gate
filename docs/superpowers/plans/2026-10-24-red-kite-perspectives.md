# Red Kite Perspectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship two attributed tellings of the Red Kite afternoon in the actual Gate app, with a checked World Labs meadow, voluntary viewpoint switching, interactive original props and reproducible evidence.

**Architecture:** Keep the existing Gate journey and single Canvas/XR store. Add an explicit fictional Red Kite story route and a portal link. Convex stores separate narrator playheads and illustration decisions; the selected telling, transition and held-object pose stay local. Reuse the cached world without provider generation.

**Tech Stack:** Existing React 19, React Three Fiber 9, React Three XR 6, Three 0.186, Spark 2.4, Convex, Blender Python and Playwright. Keep lockfiles pinned.

**Spec:** `docs/red-kite/SCENE_DIRECTION.md`, `docs/red-kite/TEAMMATE_ASSET_BRIEF.md` and the user's explicit request to implement, test and push both perspectives.

## Global Constraints

- One shared meadow, separate contributor-linked sources and choices; no historical-truth inference.
- Perspective selection is local; it never moves another participant or accepts a detail.
- No extra World Labs generation; existing limit remains five of five.
- Voluntary opaque fade before origin relocation; tracked head movement stays active.
- Unknown details do not inherit from another telling. Disagreements survive switching and reconnect.
- Original source audio only when actually recorded; any sample voice is labeled synthetic.
- Preserve Gate's existing portal, companion, album and presence work outside this explicit story route.
- Physical Quest evidence remains separate from desktop and emulated XR evidence.

## Review Focus

- A viewer or foreign-room token must not mutate narrator playheads or accepted details.
- Late world/model loads, navigation away and StrictMode remounts must not leak renders, handlers or stale state.
- Switching while holding, paused or disconnected must not leave a held object or reveal camera travel.
- Two independent viewers must keep their own selected perspective while receiving the same authored changes.
- A missing or poor reverse-view backdrop must be reported honestly; UI and pretty thumbnails cannot stand in for a spatial check.

### Task 1: Attributed story and server decisions

**Files:** Create `packages/shared/src/redKite.ts`, `convex/redKite.ts`, `tests/smoke/red-kite-perspectives.test.ts`; modify `convex/schema.ts` and cached demo script.

**Interfaces:** `RED_KITE_TELLINGS`, `resolveKiteLook(telling, progress)`; `api.redKite.prepare`, `current`, `advance`, `choose`. Every mutation uses membership, sample-room, pause, revision and command checks. Narrator identity comes from fixed fixture records, not an arbitrary client name.

- [x] Write backend tests for independent choices, unknown color, rejected suggestions, stale revisions, repeat commands, paused writes, read-only viewers and foreign rooms.
- [x] Run the focused suite; expect missing-function failures before implementation.
- [x] Implement fixed fictional sources and typed state; no paid extraction or generation.
- [x] Run root typecheck and focused backend suite; expect all pass.
- [x] Commit the cohesive data path.

### Task 2: Actual meadow and original props

**Files:** Create `apps/gate/src/red-kite/Meadow.tsx`, `viewpoints.ts`, `props.tsx`, `tools/red-kite/build_assets.py`, exported GLBs and a measured manifest.

**Interfaces:** A source-backed splat loader with metric alignment, natural color, 1,000 m far plane, independent 100k/500k choice and lifecycle cleanup. Two calibrated stationary anchors. Props expose string anchors and local lift/dock behavior.

- [x] Load the cached meadow in Gate and capture both candidate viewpoints with ground/peripheral checks; choose usable nearby anchors from actual geometry.
- [x] Build original kite, spool, support and keepsake assets with reproducible Blender Python. Validate actual GLB nodes, bounds, geometry counts and browser loading.
- [x] Preserve shared world-space object placement across views; keep local hand motion out of authored story state.
- [x] Run the Gate typecheck/build and capture the actual world and props from both final anchors.
- [x] Commit the spatial implementation and evidence.

### Task 3: Story, local transitions and native interaction

**Files:** Create `apps/gate/src/red-kite/Experience.tsx`, `session.ts`, `store.ts`, `transition.ts`, `story.css`; modify Gate App, portal and Canvas to mount the route without altering default behavior.

**Interfaces:** `?story=red-kite` creates/reopens a labeled sample or joins a shared room. `requestPerspective(id)` performs local fade-out, safe release, stationary origin change and fade-in. Backend query updates never change selected telling. Pause stops sample speech, motion and story writes.

- [x] Add focused transition/state tests for pause-mid-switch, queued input, local-only choice and release/dock.
- [x] Implement clearly attributed source cards, next-line control, separate illustration choices, compare view, sample playback, reset/reconnect handling and a keepsake ending.
- [x] Bind native XR input and an accessible button alternative; avoid conflicts with voice, pointing or pause.
- [x] Run the real flow with browser buttons/pointer and emulated XR. Capture input/state evidence separately from spatial screenshots.
- [x] Commit the actual-app experience.

### Task 4: Verification, next steps and publication

**Files:** Add reproducible Red Kite browser checks and dated evidence; update scene evaluation, teammate brief, demo script and remaining-work checklist.

- [x] Check two independent browser sessions, source ownership, per-narrator choices, declined/unknown values, local camera selection, pause, replay cancellation, reconnect and mobile/reduced-motion behavior.
- [x] Run required root/headset/Gate checks and the unchanged portal smoke; expect all required checks pass.
- [x] Obtain a fresh whole-change review, fix important findings with regression tests and record remaining hardware/live-language gates honestly.
- [x] Commit named paths, merge any remote changes without overwriting teammate work, push and verify exact local/remote parity.

## Execution notes

- The pure local transition and interaction state live together in `motion.ts`; no second global store or XR session was added.
- The spatial assets and their actual Gate consumer were verified and committed together because the two-view evidence depends on that integrated route.
- Teammate changes through `5837fff` were preserved in merge `fdada69`; both the album entry and Red Kite portal entry remain available.
- Fresh review found two P2 motion issues. Failing regressions reproduced both; the reduced-motion bridge and smoothed spool-height response now pass unit, actual-browser and emulated-input checks.
- Physical Quest comfort/frame timing, hand pinch and real family speech are explicitly assigned next in the teammate handoff.
