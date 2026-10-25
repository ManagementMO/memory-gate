import { afterEach, expect, test, vi } from 'vitest';
import { englishText, memoriesForListener, replyForListener, translateMemories, type SpokenMemory } from '../../packages/shared/src/translation';
import { nextConversationLanguage } from '../../packages/shared/src/language';
import { resolveReply, type GuideInput, type GuideReply } from '../../packages/shared/src/guide';
import { render } from '../../convex/lib/guideRender';
// @ts-expect-error the gateway is JavaScript; vitest runs the real conversation coordinator in process
import { createConversation } from '../../services/exchange/conversation.mjs';

const rosa: SpokenMemory = { id: '11111111-1111-4111-8111-111111111111', memberId: 'rosa', name: 'Rosa', text: 'Mi abuela tenía una cocina amarilla.' };
const lily: SpokenMemory = { id: '22222222-2222-4222-8222-222222222222', memberId: 'lily', name: 'Lily', text: 'I remember the flowers by the window.' };
const english = 'My grandmother had a yellow kitchen.';
const reply: GuideReply = { reply: 'La cocina amarilla, un lugar especial.', intent: 'chat', place: null, language: 'es', english,
  replyEnglish: 'The yellow kitchen, a special place.', translations: [{ id: rosa.id, language: 'es', english }] };

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

test('Spanish memories are detected and translated for the English listener, preserving the speaker and original', () => {
  const translated = translateMemories([rosa], { language: 'es-MX', english });
  expect(translated[0]).toEqual({ ...rosa, language: 'es', english });
  expect(memoriesForListener(translated, 'lily', 'en')).toEqual(translated);
  expect(memoriesForListener(translated, 'rosa', 'en')).toEqual([]);
  expect(memoriesForListener(translated, 'lily', 'es')).toEqual([]);
  expect(replyForListener({ text: reply.reply, speakIn: 'es', replyEnglish: reply.replyEnglish }, 'en')).toEqual({ text: reply.replyEnglish, language: 'en' });
  expect(replyForListener({ text: reply.reply, speakIn: 'es', replyEnglish: reply.replyEnglish }, 'es')).toEqual({ text: reply.reply, language: 'es' });
});

test('mixed-language batches map translations by utterance id even if the model returns them out of order', () => {
  const translated = translateMemories([rosa, lily], { language: 'en', english: 'Do not assign this combined reading to anyone.', translations: [
    { id: lily.id, language: 'en', english: '' }, { id: rosa.id, language: 'es', english },
  ] });
  expect(translated).toEqual([{ ...rosa, language: 'es', english }, { ...lily, language: 'en', english: null }]);
  expect(memoriesForListener(translated, 'lily', 'en')).toEqual([translated[0]]);
  // Each participant's Automatic language follows only their own words.
  expect(nextConversationLanguage('en', 'auto', { claimed: translated[0]!.language, text: rosa.text })).toBe('es');
  expect(nextConversationLanguage('en', 'auto', { claimed: translated[1]!.language, text: lily.text })).toBe('en');
  expect(nextConversationLanguage('en', 'en', { claimed: 'es', text: rosa.text })).toBe('en');
  expect(nextConversationLanguage('en', 'auto', { claimed: 'es', text: 'sí' })).toBe('en');
});

test('missing, duplicate and unknown translation ids never attach another person’s words', () => {
  const translated = translateMemories([rosa, lily], { language: 'es', english, translations: [{ id: 'unknown', language: 'es', english }] });
  expect(translated.every((t) => t.english === null)).toBe(true);
  expect(translateMemories([rosa], { translations: [reply.translations![0]!, reply.translations![0]!] })[0]!.english).toBeNull();
});

test('English turns remain English; no keys, empty readings and untranslated Spanish never pretend to be translations', () => {
  expect(translateMemories([lily], { language: 'en', english: lily.text })[0]!.english).toBeNull();
  expect(translateMemories([rosa], null)[0]).toEqual({ ...rosa, language: 'es', english: null });
  for (const bad of ['', '  ', rosa.text, 'https://example.com', 'x'.repeat(1801)]) expect(englishText(bad)).toBeNull();
  expect(replyForListener({ text: reply.reply, speakIn: 'es', replyEnglish: null }, 'en')).toEqual({ text: reply.reply, language: 'es' });
});

test('a rejected companion reply cannot leak its stale English translation into playback', () => {
  const input = { phase: 'memory' as const, transcript: rosa.text, history: [], media: null, mediaCaption: null, place: null, invitedToEnter: false, turnsInPhase: 1, language: 'en' as const, setting: 'auto' as const };
  const result = resolveReply(input, { ...reply, replyEnglish: 'This will cure your dementia.' });
  expect(result.reply.reply).not.toBe(reply.reply);
  expect(result.reply.replyEnglish).not.toContain('cure');
  expect(result.reply.replyEnglish).toBeTruthy();
});

// Exercise accepted microphone turns → provider request → gateway broadcasts, without network/provider keys.
function room(online: GuideReply | null) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T13:00:00Z'));
  const turns: Record<string, unknown>[] = [];
  const table = (values: Record<string, unknown>[] = []) => ({ iter: () => values.values(), id: { find: () => null }, memberId: { find: () => null }, roomId: { find: () => null } });
  const db = { db: { perspective: table(), pose: table(), perspectiveStory: table(), conversationTurn: table(turns), conversationSummary: table() },
    reducers: { addConversationTurn: vi.fn(async (t) => { turns.push({ ...t, createdAt: Date.now() }); }), addUtterance: vi.fn(async () => {}), setConversationSummary: vi.fn(async () => {}) } };
  const client = (id: string, name: string, isOwner: boolean, roomId = 'family') => ({ context: { roomId, memberId: id, displayName: name, isOwner, clipsAllowed: false }, authorizedAt: Date.now(), auth: { code: roomId, token: id } });
  const grandma = client('rosa', 'Rosa', false), grandkid = client('lily', 'Lily', true), stranger = client('other', 'Other', true, 'another-room');
  const send = vi.fn(), action = vi.fn(async (_ref: unknown, _args: { input: GuideInput }) => online);
  const conversation = createConversation({ db, clients: new Set([grandma, grandkid, stranger]), send, convex: { action } });
  conversation.flow(grandkid, grandkid.context, { stage: 'memory' });
  const say = (c: typeof grandma, words: SpokenMemory) => conversation.utterance(c, c.context, { turnId: words.id, text: words.text, snrDb: 28, durationMs: 1000, language: 'en', setting: 'auto' });
  const messages = (c: typeof grandma) => send.mock.calls.filter(([who]) => who === c).map(([, message]) => message);
  return { grandma, grandkid, stranger, say, messages, action, turns, conversation };
}

test('the gateway sends a Spanish memory’s translation to the grandkid and an English reply for playback', async () => {
  const r = room(reply);
  await r.say(r.grandma, rosa);
  await vi.advanceTimersByTimeAsync(1600);
  const translated = r.messages(r.grandkid).find((m) => m.type === 'translation');
  expect(translated.heard).toEqual([{ ...rosa, language: 'es', english }]);
  const answer = r.messages(r.grandkid).find((m) => m.type === 'companion');
  expect(replyForListener(answer, 'en').text).toBe(reply.replyEnglish);
  expect(replyForListener(answer, 'es').text).toBe(reply.reply);
  expect(r.messages(r.stranger)).toEqual([]);
  const input = r.action.mock.calls[0]![1].input;
  expect(input.utterances).toEqual([{ id: rosa.id, name: rosa.name, text: rosa.text }]);
  expect(render(input)).toContain('Return these even when listen is true');
});

test('translation still reaches the listener when the companion stays quiet', async () => {
  const r = room({ ...reply, listen: true, reply: '' });
  await r.say(r.grandma, rosa);
  await vi.advanceTimersByTimeAsync(1600);
  expect(r.messages(r.grandkid).map((m) => m.type)).toEqual(['translation']);
  expect(r.messages(r.grandkid)[0].heard[0].english).toBe(english);
  expect(r.turns.filter((t) => t.who === 'companion')).toHaveLength(0);
});

test('the last English speaker does not erase a preceding Spanish memory’s translation', async () => {
  const r = room({ ...reply, language: 'en', reply: 'The flowers by the window.', replyEnglish: null, translations: [...reply.translations!, { id: lily.id, language: 'en', english: null }] });
  await r.say(r.grandma, rosa);
  await r.say(r.grandkid, lily);
  await vi.advanceTimersByTimeAsync(1600);
  const words = r.messages(r.grandkid).find((m) => m.type === 'translation').heard;
  expect(memoriesForListener(words, 'lily', 'en').map((w) => w.english)).toEqual([english]);
  expect(r.messages(r.grandkid).find((m) => m.type === 'companion').language).toBe('en');
});

test('offline detection reports missing translations honestly and still provides an English canned reply', async () => {
  const r = room(null);
  await r.say(r.grandma, rosa);
  await vi.advanceTimersByTimeAsync(1600);
  expect(r.messages(r.grandkid).find((m) => m.type === 'translation').heard[0]).toMatchObject({ language: 'es', english: null });
  const answer = r.messages(r.grandkid).find((m) => m.type === 'companion');
  expect(replyForListener(answer, 'en').language).toBe('en');
  expect(answer.language).toBe('es');
});

test('a translation arriving after the family leaves is not broadcast', async () => {
  const r = room(reply);
  let finish!: (value: GuideReply) => void;
  r.action.mockImplementation(() => new Promise<GuideReply>((resolve) => { finish = resolve; }));
  await r.say(r.grandma, rosa);
  await vi.advanceTimersByTimeAsync(1600);
  r.conversation.flow(r.grandkid, r.grandkid.context, { stage: 'album' });
  finish(reply);
  await vi.advanceTimersByTimeAsync(0);
  expect(r.messages(r.grandkid)).toEqual([]);
});

test('a delayed translation cannot cross between the gate and the memory', async () => {
  const r = room({ ...reply, listen: true, reply: '' });
  let finish!: (value: GuideReply) => void;
  r.action.mockImplementation(() => new Promise<GuideReply>((resolve) => { finish = resolve; }));
  await r.say(r.grandma, rosa);
  await vi.advanceTimersByTimeAsync(1600);
  r.conversation.flow(r.grandkid, r.grandkid.context, { stage: 'gathering' });
  finish({ ...reply, listen: true, reply: '' });
  await vi.advanceTimersByTimeAsync(0);
  expect(r.messages(r.grandkid)).toEqual([]);
});

test('pending words from before stepping through are still discarded by the upstream phase guard', async () => {
  const r = room(reply);
  r.conversation.flow(r.grandkid, r.grandkid.context, { stage: 'gathering' });
  await r.say(r.grandma, rosa);
  r.conversation.flow(r.grandkid, r.grandkid.context, { stage: 'forming' });
  await vi.advanceTimersByTimeAsync(2000);
  expect(r.action).not.toHaveBeenCalled();
  expect(r.messages(r.grandkid)).toEqual([]);
});
