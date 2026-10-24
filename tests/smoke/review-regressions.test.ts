import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import { mockExtract, validate, type ExtractionResult } from '../../packages/shared/src/contract';
import { cid, drain, newT, setupRoom } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const agreement: ExtractionResult = {
  intent: 'confirm_pending', proposals: [], companion_reply: 'Tell me more.',
  reply_translation: '', language: 'es', translation: 'Do not move it.',
  flags: { distress: false, private_info: false, instruction_like_text: false },
};

test.each(['No lo muevas.', "Don't move it.", 'Don’t move it.', 'Do not change it.'])(
  'a mistaken model confirmation cannot apply a change for %s', (transcript) => {
    expect(validate(transcript, agreement).actions).toEqual([]);
  },
);
test('a mistaken model proposal cannot add the object mentioned in a keep-unchanged request', () => {
  const out: ExtractionResult = { ...agreement, language: 'en', intent: 'propose_object', proposals: [{
    object: 'bench', details: [], anchor: 'floor', relation: 'next_to', where: '', quote: 'move the bench', confidence: .99,
  }] };
  expect(validate("Don't move the bench.", out).actions).toEqual([]);
});
test('offline interpretation also treats a request to leave things unchanged as no action', () => {
  expect(mockExtract('No lo muevas.', ['piano']).intent).toBe('none');
});

test('a question about whether an object existed never becomes an offline proposal', () => {
  expect(mockExtract('Was the piano by the window?', ['piano']).intent).toBe('none');
  expect(mockExtract('Can we stop for today?', ['piano']).intent).toBe('pause_session');
});
test('the validator also prevents a mistaken model proposal for a recall question', () => {
  const out: ExtractionResult = { ...agreement, language: 'en', intent: 'propose_object', proposals: [{
    object: 'piano', details: [], anchor: 'window', relation: 'next_to', where: '', quote: 'piano by the window', confidence: .99,
  }] };
  expect(validate('Was the piano by the window?', out).actions).toEqual([]);
});

test('different rooms may reuse a client command id without leaking or suppressing objects', async () => {
  const t = newT();
  const a = await setupRoom(t, { library: false });
  const b = await setupRoom(t, { library: false, sample: false });
  const commandId = cid();
  const first = await t.mutation(api.objects.proposeFromPhone, { code: a.code, token: a.owner, label: 'bench', commandId });
  const second = await t.mutation(api.objects.proposeFromPhone, { code: b.code, token: b.owner, label: 'chair', commandId });
  expect(second.duplicate).toBe(false);
  expect(second.objectId).not.toBe(first.objectId);
  expect(await t.query(api.objects.list, { code: b.code, token: b.owner })).toMatchObject([{ label: 'chair' }]);
});

test('utterance idempotency is scoped to the room', async () => {
  const t = newT();
  const a = await setupRoom(t, { library: false });
  const b = await setupRoom(t, { library: false, sample: false });
  const commandId = cid();
  const first = await t.mutation(api.utterances.add, { code: a.code, token: a.owner, transcript: 'A first story.', source: 'typed', commandId });
  const second = await t.mutation(api.utterances.add, { code: b.code, token: b.owner, transcript: 'A different story.', source: 'typed', commandId });
  expect(second.duplicate).toBe(false);
  expect(second.utteranceId).not.toBe(first.utteranceId);
  await drain(t);
  expect(await t.query(api.utterances.recent, { code: b.code, token: b.owner })).toMatchObject([{ transcript: 'A different story.' }]);
});
