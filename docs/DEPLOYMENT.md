# Running and deploying

## What is running here

This review is local. Convex listens on 3210; managed IWSDK development on HTTPS 8081; the headset production preview on HTTPS 4173; phone development on HTTP 5173 and HTTPS 5174. The phone production build compiles, but its running local interface is a Vite development server. There is no externally deployed application or public durable backend.

scripts/start-all.sh installs missing dependencies, starts checkout-owned detached services, ensures original assets are seeded, and prepares the headset production preview. Logs and PID files are in ignored .logs/. It leaves existing services running. npm run demo:links reopens a prepared room; npm run demo:room creates a new labeled illustrative room.

scripts/stop-all.sh checks ownership before stopping local services. It does not claim to shut down remote Modal compute merely because a local process exited. The default startup does not start that GPU worker.

## Production prerequisites

A real deployment needs a designated Convex deployment, server-side provider credentials, trusted HTTPS for the web apps, working same-origin API/WebSocket/storage routing, durable media, stronger media authorization and a funded provider policy. See LIMITATIONS.md for privacy and budget gaps. Do not expose the current anonymous local backend to the public internet.

A cloud frontend cannot reach this Mac's 127.0.0.1 backend. Copying the built HTML to a host would not deploy the complete product. Source publication uses the public ManagementMO/memory-gate repository; pushing source does not deploy the application. No Railway, R2 or unrelated hosting resource was provisioned during this review.

After an authorized deployment, verify from a fresh external browser context: version/health, two independent memberships, WebSocket updates, proposal/confirm/replay/undo, original recording upload/playback, permissions/revocation, reload/reconnect and backend restart persistence. Then perform the actual Quest checklist against that external origin. Local or emulator results do not establish these deployment results.
