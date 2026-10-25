// Load project-scoped private configuration without exposing it in logs or browser bundles.
import { existsSync, readFileSync } from 'node:fs';
for (const file of ['.env.local', '.env.worker', '.env.exchange']) {
  if (existsSync(file)) process.loadEnvFile(file);
}
// Match env:push: a supplied private provider file takes precedence over exchange defaults.
const providerFile = process.env.MEMORY_GATE_ENV || process.env.MEMGATE_AUTH_FILE || 'auth/memory-gate.env';
if (existsSync(providerFile)) {
  for (const line of readFileSync(providerFile, 'utf8').split('\n')) {
    const match = line.match(/^(APIFY_TOKEN|ALLOW_APIFY_CLOUD|APIFY_MEMORY_ACTOR_ID)=(.*)$/);
    if (match) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}
if (!process.env.SPACETIME_TOKEN && existsSync('.spacetime/config/cli.toml')) {
  process.env.SPACETIME_TOKEN = readFileSync('.spacetime/config/cli.toml', 'utf8').match(/^spacetimedb_token\s*=\s*"([^"]+)"/m)?.[1];
}
await import('../services/exchange/server.mjs');
