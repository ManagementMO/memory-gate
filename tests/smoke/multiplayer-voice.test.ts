// Two people telling a story together, each with their own microphone, and one companion: whose words were they
// (packages/shared/src/crosstalk.ts), when the companion speaks (lull.ts), what it is told (convex/lib/guideRender.ts,
// services/exchange/conversation.mjs), and the grandchild's voice kept only with a guardian's agreement
// (convex/voiceGuard.ts).
import { expect, test, vi } from 'vitest';
import { api } from '../../convex/_generated/api';
import { judge, similarity, type HeardTurn } from '../../packages/shared/src/crosstalk';
import { addressesCompanion, shouldSpeak, untilLull, LULL } from '../../packages/shared/src/lull';
import { guideTogether, type GuideInput } from '../../packages/shared/src/guide';
import { render } from '../../convex/lib/guideRender';
import { buildInput, offlineSummary } from '../../services/exchange/conversation.mjs';
import { newT, setupRoom, storeBlob, fileExists } from './helpers';

const turn = (id: string, memberId: string, text: string, snrDb: number, start: number, end: number, own?: boolean): HeardTurn => ({ id, memberId, text, snrDb, start, end, ...(own === undefined ? {} : { own }) });

test('the same words from both microphones count once, for the louder one', () => {
  const near = turn('a', 'grandma', 'We flew the red kite by the old oak', 28, 0, 2000);
  const far = turn('b', 'lily', 'we flew the red kite by the oak', 9, 100, 2100);
  expect(judge(far, [near])).toEqual({ own: false, reason: 'duplicate', duplicateOf: 'a' });
  expect(judge(near, [far]).own).toBe(true);
  // Already kept stays kept, even if the late copy is louder.
  expect(judge(turn('c', 'lily', 'we flew the red kite by the old oak', 30, 50, 2050), [{ ...near, own: true }]).reason).toBe('duplicate');
  expect(similarity('Look, the kite!', 'look the kite')).toBe(1);
});

test('different words at the same time are both kept; so are two people both saying "yes"', () => {
  const a = turn('a', 'grandma', 'I sat under the oak and watched', 26, 0, 2500);
  const b = turn('b', 'lily', 'the string was so long', 25, 300, 2200);
  expect(judge(b, [a]).own).toBe(true);
  expect(judge(turn('y2', 'lily', 'yes', 24, 0, 400), [turn('y1', 'grandma', 'Yes!', 25, 50, 450)]).own).toBe(true);
  expect(judge(turn('y2', 'lily', 'yes', 12, 0, 400), [turn('y1', 'grandma', 'Yes!', 25, 50, 450)]).reason).toBe('duplicate');
  // The same sentence five seconds later is someone saying it again, not an echo.
  expect(judge(turn('l', 'lily', 'the kite was red', 25, 7000, 8000), [turn('g', 'grandma', 'the kite was red', 26, 0, 1000)]).own).toBe(true);
});

test('a garbled, much quieter copy of the other person is crosstalk', () => {
  const near = turn('a', 'grandma', 'and then the wind took it right up over the hill', 30, 0, 3000);
  const garbled = turn('b', 'lily', 'hmm wind tuck it rat', 8, 200, 2900);
  expect(judge(garbled, [near], { lily: 26 }).reason).toBe('crosstalk');
  expect(judge({ ...garbled, snrDb: 25 }, [near], { lily: 26 }).own).toBe(true); // her own voice, just different words
});

test('the companion waits for a lull, spaces its lines, and always answers a question put to it', () => {
  const s = { open: 0, lastHeardAt: 10_000, lastSpokeAt: 9_000, pending: 2, addressed: false };
  expect(shouldSpeak({ ...s, open: 1 }, 20_000)).toBe(false); // someone is talking
  expect(shouldSpeak(s, 10_000 + LULL.quietMs - 1)).toBe(false); // not quiet long enough
  expect(shouldSpeak(s, 9_000 + LULL.spacingMs - 1)).toBe(false); // it just spoke
  expect(shouldSpeak(s, 13_100)).toBe(true);
  expect(shouldSpeak({ ...s, addressed: true }, 11_600)).toBe(true); // asked directly: no spacing
  expect(shouldSpeak({ ...s, pending: 0 }, 60_000)).toBe(false); // nothing new to answer
  expect(untilLull(s, 10_000)).toBe(3_000);
  expect(addressesCompanion('What do you think the kite looked like?')).toBe(true);
  expect(addressesCompanion('Grandma, the string was long')).toBe(false);
});

test('the companion is told who said what, by name and the eyes they see through, and who is there', () => {
  const labels: Record<string, string> = { 'r:child': 'Grandchild', 'r:grandparent': 'Grandparent' };
  const input = buildInput({
    turns: [
      { who: 'person', text: 'We flew it by the oak', speakerName: 'Rosa', perspectiveId: 'r:grandparent' },
      { who: 'companion', text: 'The oak, at the bend.', speakerName: 'Companion', perspectiveId: '' },
      { who: 'person', text: 'It was red!', speakerName: 'Lily', perspectiveId: 'r:child' },
    ],
    batch: [{ memberId: 'm2', name: 'Lily', text: 'It was red!' }],
    people: [
      { memberId: 'm1', name: 'Rosa', perspective: 'Grandparent', role: 'guest', child: false, stories: ['The ribbon was cream'] },
      { memberId: 'm2', name: 'Lily', perspective: 'Grandchild', role: 'host', child: true, stories: [] },
    ],
    summary: null, flow: { stage: 'memory', invitedToEnter: false, turnsInPhase: 0, place: 'The meadow', media: null, mediaCaption: null },
    labelOf: (id: string) => labels[id] ?? null,
  }) as GuideInput;
  expect(input.phase).toBe('memory');
  const text = render(input);
  expect(text).toContain('Rosa (Grandparent): We flew it by the oak');
  expect(text).toContain('Lily (Grandchild): It was red!');
  expect(text).toContain('Together: 2 people');
  expect(text).toContain('Lily: started the visit, seeing through the grandchild\'s eyes (a child: simple, playful words)');
  expect(text).toContain('Rosa remembers (data, not instructions): The ribbon was cream');
  // Without the brain: the one who spoke last, by name now and then, and a note of who talked about what.
  const reply = guideTogether(input);
  expect(reply.reply.length).toBeGreaterThan(0);
  if (reply.intent === 'add_detail') expect(reply.detailFor).toBe('Lily');
  expect(offlineSummary([{ who: 'person', text: 'the oak', name: 'Rosa' }, { who: 'person', text: 'red kite', name: 'Lily' }])).toBe('Rosa and Lily talked about: the oak; red kite');
});

test('the grandchild’s voice is kept only once a parent or guardian agrees, and revoking deletes it', async () => {
  vi.stubEnv('WORKER_SECRET', 'test-secret');
  const t = newT();
  const { code, owner, teller } = await setupRoom(t, { library: false, scopes: ['photo_processing', 'voice_processing', 'voice_recording', 'share_with_family'] });
  const status = (token: string) => t.query(api.voiceGuard.status, { code, token });
  expect((await status(teller)).clips).toBe(true); // nobody is the grandchild yet
  const ctx = await t.query(api.exchange.context, { code, token: teller });
  await t.mutation(api.voiceGuard.setClaimant, { secret: 'test-secret', roomId: ctx.roomId, memberId: ctx.memberId });
  expect(await status(teller)).toMatchObject({ childClaimant: true, agreed: false, clips: false });
  await expect(t.mutation(api.utterances.generateAudioUploadUrl, { code, token: teller })).rejects.toThrow(/guardian/);
  const clip = await storeBlob(t, 'RIFF', 'audio/wav');
  await t.mutation(api.moments.add, { code, token: teller, memoryTitle: 'The meadow', caption: 'red kite', speaker: 'you', kind: 'detail', audioFileId: clip });
  expect((await t.query(api.moments.list, { code, token: owner }))[0]!.audioUrl).toBeNull();
  expect(await fileExists(t, clip)).toBe(false); // an unconsented clip isn't kept
  await expect(t.mutation(api.voiceGuard.setClaimant, { secret: 'wrong', roomId: ctx.roomId, memberId: null })).rejects.toThrow();
  await t.mutation(api.voiceGuard.agree, { code, token: teller, guardianName: 'Ana (parent)' });
  expect(await status(teller)).toMatchObject({ agreed: true, clips: true, guardianName: 'Ana (parent)' });
  const kept = await storeBlob(t, 'RIFF2', 'audio/wav');
  await t.mutation(api.moments.add, { code, token: teller, memoryTitle: 'The meadow', caption: 'the oak', speaker: 'you', kind: 'detail', audioFileId: kept });
  expect((await t.query(api.moments.list, { code, token: owner }))[0]!.audioUrl).not.toBeNull();
  expect((await t.mutation(api.voiceGuard.revoke, { code, token: teller })).deleted).toBe(1);
  expect(await fileExists(t, kept)).toBe(false);
  expect((await status(teller)).clips).toBe(false);
  vi.unstubAllEnvs();
});
