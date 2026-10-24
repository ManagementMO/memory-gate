// Load project-scoped private configuration without exposing it in logs or browser bundles.
import { existsSync, readFileSync } from 'node:fs';
for (const file of ['.env.local', '.env.worker', '.env.exchange']) {
  if (existsSync(file)) process.loadEnvFile(file);
}
if (!process.env.SPACETIME_TOKEN && existsSync('.spacetime/config/cli.toml')) {
  process.env.SPACETIME_TOKEN = readFileSync('.spacetime/config/cli.toml', 'utf8').match(/^spacetimedb_token\s*=\s*"([^"]+)"/m)?.[1];
}
await import('../services/exchange/server.mjs');
