import { beforeEach, expect, test, vi } from 'vitest';
const client = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock('../../apps/gate/src/backend/client', () => ({ convex: client }));
const session = { code: 'KITE26', token: 'sample-test-token', role: 'family' as const };
let saved = new Map<string, string>();
const view = (paused = false) => ({ room: { demo: true, paused }, me: { isOwner: true }, consents: [] });
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); saved = new Map([['mg.red-kite.session.owner', JSON.stringify(session)]]);
  vi.stubGlobal('location', { search: '?story=red-kite' });
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v), removeItem: (k: string) => saved.delete(k) });
});
test('a prepared paused story reopens read-only without unpausing or creating another room', async () => {
  client.query.mockResolvedValueOnce(view(true)).mockResolvedValueOnce({ paused: true, tellings: [] });
  const { openKiteSession } = await import('../../apps/gate/src/red-kite/session');
  expect(await openKiteSession()).toEqual(session); expect(client.mutation).not.toHaveBeenCalled();
});
test('an interrupted owner setup recovers the cached world and fixed sources, with one StrictMode bootstrap', async () => {
  client.query.mockResolvedValueOnce(view()).mockResolvedValueOnce(null).mockResolvedValueOnce(view());
  client.mutation.mockResolvedValue({ ok: true });
  const { openKiteSession } = await import('../../apps/gate/src/red-kite/session');
  const first = openKiteSession(), second = openKiteSession(); expect(first).toBe(second); await first;
  expect(client.mutation.mock.calls.map(c => c[1])).toEqual([
    { code: session.code, token: session.token, scopes: ['share_with_family'] },
    { code: session.code, token: session.token, setting: 'red-kite' },
    { code: session.code, token: session.token },
  ]);
});
test('a transport failure preserves the saved membership and does not silently create a new room', async () => {
  client.query.mockRejectedValue(new Error('network transport lost'));
  const { openKiteSession } = await import('../../apps/gate/src/red-kite/session');
  await expect(openKiteSession()).rejects.toThrow('transport');
  expect(saved.has('mg.red-kite.session.owner')).toBe(true); expect(client.mutation).not.toHaveBeenCalled();
});
