// `npm run doctor` provider check: one tiny authenticated GET per provider, made with the keys in THIS deployment's
// environment (npx convex env set). Returns only PASS / FAIL / SKIP, latency and a short redacted detail; key values
// never leave the backend. WORKER_SECRET-guarded (the doctor script reads it from .env.worker). Default runtime: no
// "use node" needed for fetch.
import { ConvexError, v } from 'convex/values';
import { action, query } from './_generated/server';

type Status = 'PASS' | 'FAIL' | 'SKIP';
export type DoctorRow = { name: string; status: Status; ms: number | null; detail: string };

const KEY_NAMES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID', 'CARTESIA_API_KEY', 'TRIPO_API_KEY', 'WORLD_LABS_API_KEY', 'WORLDLABS_API_KEY', 'WORKER_SECRET'] as const;

function redact(s: string): string {
  let out = s;
  for (const k of KEY_NAMES) {
    const val = process.env[k];
    if (val && val.length >= 6) out = out.split(val).join('<redacted>');
  }
  return out.replace(/sk-ant-[A-Za-z0-9_-]+/g, '<redacted>').replace(/sk_car_[A-Za-z0-9_-]+/g, '<redacted>').replace(/tsk_[A-Za-z0-9_-]+/g, '<redacted>').slice(0, 120);
}

async function probe(name: string, url: string, headers: Record<string, string>, ok: (status: number, body: unknown) => string | null): Promise<DoctorRow> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const ms = Date.now() - t0;
    const text = await res.text();
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) {
      const b = body as { error?: { type?: string; message?: string }; message?: string } | null;
      return { name, status: 'FAIL', ms, detail: redact(`HTTP ${res.status} ${b?.error?.type ?? ''} ${b?.error?.message ?? b?.message ?? ''}`.trim()) };
    }
    const detail = ok(res.status, body);
    return detail === null ? { name, status: 'FAIL', ms, detail: redact(`HTTP ${res.status}, unexpected body`) } : { name, status: 'PASS', ms, detail: redact(detail) };
  } catch (e) {
    const err = e as Error;
    return { name, status: 'FAIL', ms: Date.now() - t0, detail: err.name === 'AbortError' ? 'timeout after 10 s' : redact(err.message ?? String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

const skip = (name: string, why: string): DoctorRow => ({ name, status: 'SKIP', ms: null, detail: why });
const numbers = (o: unknown) => JSON.stringify(Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).filter(([, x]) => typeof x === 'number')));

export const providers = action({
  args: { secret: v.string() },
  handler: async (_ctx, { secret }): Promise<{ rows: DoctorRow[]; envSet: Record<string, boolean> }> => {
    if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError({ code: 'FORBIDDEN', message: 'bad secret' });
    const env = process.env;
    const jobs: Promise<DoctorRow>[] = [];

    const anthropic = env.ANTHROPIC_API_KEY;
    if (anthropic) {
      const h: Record<string, string> = { 'x-api-key': anthropic, 'anthropic-version': '2023-06-01' };
      if (env.ANTHROPIC_WORKSPACE_ID) h['anthropic-workspace-id'] = env.ANTHROPIC_WORKSPACE_ID; // org-level key: names the workspace
      jobs.push(probe('anthropic GET /v1/models/claude-sonnet-5-5', 'https://api.anthropic.com/v1/models/claude-sonnet-5-5', h,
        (_s, b) => { const m = b as { id?: string; display_name?: string } | null; return m?.id ? `${m.display_name ?? m.id}${env.ANTHROPIC_WORKSPACE_ID ? '' : ' (no workspace id set)'}` : null; }));
    } else jobs.push(Promise.resolve(skip('anthropic', 'ANTHROPIC_API_KEY not set in Convex env')));

    if (env.CARTESIA_API_KEY) {
      jobs.push(probe('cartesia GET /voices?limit=1', 'https://api.cartesia.ai/voices?limit=1', { Authorization: `Bearer ${env.CARTESIA_API_KEY}`, 'Cartesia-Version': '2026-08-14' },
        (_s, b) => { const d = (b as { data?: unknown[] } | null)?.data; return Array.isArray(d) ? `voices returned: ${d.length}` : null; }));
    } else jobs.push(Promise.resolve(skip('cartesia', 'CARTESIA_API_KEY not set in Convex env')));

    if (env.TRIPO_API_KEY) {
      jobs.push(probe('tripo GET /v3/account/balance', 'https://openapi.tripo3d.ai/v3/account/balance', { Authorization: `Bearer ${env.TRIPO_API_KEY}` },
        (_s, b) => { const j = b as { code?: number; data?: unknown } | null; return j?.code === 0 ? `balance ${numbers(j.data)}` : null; }));
    } else jobs.push(Promise.resolve(skip('tripo', 'TRIPO_API_KEY not set in Convex env')));

    const wl = env.WORLD_LABS_API_KEY ?? env.WORLDLABS_API_KEY;
    if (wl) {
      jobs.push(probe('worldlabs GET /marble/v1/credits', 'https://api.worldlabs.ai/marble/v1/credits', { 'WLT-Api-Key': wl },
        (_s, b) => (b && typeof b === 'object' ? `credits ${numbers(b)}` : null)));
    } else jobs.push(Promise.resolve(skip('worldlabs', 'WORLD_LABS_API_KEY not set in Convex env')));

    const rows = await Promise.all(jobs);
    const envSet = Object.fromEntries(KEY_NAMES.map((k) => [k, !!env[k]]));
    return { rows, envSet };
  },
});

/** What the seed script needs to stay idempotent: each library row and asset with its stored file's sha256 and size,
 * so unchanged files are not re-uploaded (a new upload would make admin.upsert* delete the old file, which existing
 * rooms still reference from their splat and object rows). Also lets the doctor spot rows whose file is gone. */
export const seedState = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) throw new ConvexError({ code: 'FORBIDDEN', message: 'bad secret' });
    const file = async (id: import('./_generated/dataModel').Id<'_storage'>) => {
      const f = await ctx.db.system.get(id);
      return f ? { sha256: f.sha256, size: f.size } : null;
    };
    const library = await Promise.all((await ctx.db.query('library').collect()).map(async (l) => ({ key: l.key, fileId: l.fileId, size: l.size, yawOffset: l.yawOffset, source: l.source, file: await file(l.fileId) })));
    const assets = await Promise.all((await ctx.db.query('assets').collect()).map(async (a) => ({ key: a.key, fileId: a.fileId, file: await file(a.fileId) })));
    return { library, assets };
  },
});
