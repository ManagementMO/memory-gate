// Perspectives (apps/gate social layer): likenesses, consent for a child's likeness, and names others see.
import { expect, test, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { newT, setupRoom, fileExists, type T } from './helpers';

const SECRET = 'local-test-worker';
/** A minimal binary glTF 2.0 header (magic, version 2, length) followed by padding. */
function glb(version = 2): Blob {
  const b = new ArrayBuffer(64);
  const v = new DataView(b);
  [0x67, 0x6c, 0x54, 0x46].forEach((c, i) => v.setUint8(i, c));
  v.setUint32(4, version, true);
  v.setUint32(8, 64, true);
  return new Blob([b], { type: 'model/gltf-binary' });
}
const store = (t: T, blob: Blob) => t.run((ctx) => ctx.storage.store(blob)) as Promise<Id<'_storage'>>;

test('a child’s likeness needs a named guardian’s agreement; anything that isn’t glTF 2.0 is refused and deleted', async () => {
  vi.stubEnv('WORKER_SECRET', SECRET);
  const t = newT(); const r = await setupRoom(t, { sample: false, library: false });
  const s = { code: r.code, token: r.owner };
  const noGuardian = await store(t, glb());
  await expect(t.action(api.avatars.register, { ...s, fileId: noGuardian, label: 'Lily', subjectIsMinor: true })).rejects.toThrow(/guardian/i);
  expect(await fileExists(t, noGuardian)).toBe(false);
  const notGlb = await store(t, new Blob(['not a model'], { type: 'text/plain' }));
  await expect(t.action(api.avatars.register, { ...s, fileId: notGlb, label: 'Joe', subjectIsMinor: false })).rejects.toThrow(/glTF/);
  expect(await fileExists(t, notGlb)).toBe(false);
  const v1 = await store(t, glb(1));
  await expect(t.action(api.avatars.register, { ...s, fileId: v1, label: 'Joe', subjectIsMinor: false })).rejects.toThrow(/glTF 2/);

  const ok = await store(t, glb());
  const { key } = await t.action(api.avatars.register, { ...s, fileId: ok, label: 'Lily', subjectIsMinor: true, guardianName: 'Karen', guardianAgrees: true });
  expect(key).toMatch(/^[a-z0-9]{40}$/);
  const resolved = await t.query(api.avatars.resolve, { secret: SECRET, key });
  expect(resolved).toMatchObject({ subjectIsMinor: true, guardianConsent: true });
  expect(resolved?.url).toBeTruthy();
  vi.unstubAllEnvs();
});

test('only the gateway can resolve a likeness, and revoking deletes it everywhere', async () => {
  vi.stubEnv('WORKER_SECRET', SECRET);
  const t = newT(); const r = await setupRoom(t, { sample: false, library: false });
  const s = { code: r.code, token: r.owner };
  const fileId = await store(t, glb());
  const { key } = await t.action(api.avatars.register, { ...s, fileId, label: 'Grandpa Joe', subjectIsMinor: false });
  await expect(t.query(api.avatars.resolve, { secret: 'wrong', key })).rejects.toThrow();
  const a = await t.query(api.avatars.resolve, { secret: SECRET, key });
  expect(await t.query(api.avatars.activeIds, { secret: SECRET, ids: [a!.id, 'not-an-id'] })).toEqual([a!.id]);
  // Revoking needs the key itself: a wrong key changes nothing.
  await t.mutation(api.avatars.revoke, { ...s, key: 'x'.repeat(40) });
  expect(await t.query(api.avatars.resolve, { secret: SECRET, key })).not.toBeNull();
  await t.mutation(api.avatars.revoke, { ...s, key });
  expect(await t.query(api.avatars.resolve, { secret: SECRET, key })).toBeNull();
  expect(await t.query(api.avatars.activeIds, { secret: SECRET, ids: [a!.id] })).toEqual([]);
  expect(await fileExists(t, fileId)).toBe(false);
  vi.unstubAllEnvs();
});

test('the name others see can be changed by its owner and reaches the exchange context', async () => {
  const t = newT(); const r = await setupRoom(t, { sample: false, library: false });
  await expect(t.mutation(api.rooms.rename, { code: r.code, token: r.owner, displayName: '   ' })).rejects.toThrow();
  expect(await t.mutation(api.rooms.rename, { code: r.code, token: r.owner, displayName: '  Grandpa   Joe  ' })).toBe('Grandpa Joe');
  const ctx = await t.query(api.exchange.context, { code: r.code, token: r.owner });
  expect(ctx.displayName).toBe('Grandpa Joe');
  expect(ctx.isOwner).toBe(true);
});
