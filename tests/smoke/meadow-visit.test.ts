// A visit to the kite meadow isn't ended by "let's go" (how it started, and what children shout at a kite): a second
// "yes, let's go" arriving while the place forms used to send the visit straight back out. Clear wishes still leave.
import { expect, test } from 'vitest';
import { asksToGoIn, asksToLeave, guideOffline, type GuideInput } from '../../packages/shared/src/guide';

const at = (phase: 'gathering' | 'memory', transcript: string, extra: Partial<GuideInput> = {}): GuideInput =>
  ({ phase, transcript, history: [], media: null, mediaCaption: null, place: 'The meadow with the kite', invitedToEnter: false, turnsInPhase: 0, language: 'en', setting: 'auto', ...extra });

test('"let\'s go" steps in at the gate and never ends a visit inside', () => {
  expect(guideOffline(at('gathering', 'Yes, let’s go!', { invitedToEnter: true })).intent).toBe('enter');
  for (const t of ['Let’s go!', 'yes let’s go', 'okay let’s go', 'let’s go now']) {
    expect(asksToGoIn(t)).toBe(true); // the controller and the room's companion skip leaving for these
    expect(guideOffline(at('memory', t)).intent, t).not.toBe('leave');
  }
});

test('a clear wish to leave still leaves at once', () => {
  for (const t of ['Let’s go home now.', 'take me back', 'I’d like to leave', 'goodbye', 'can we go back now']) {
    expect(asksToLeave(t) && !asksToGoIn(t), t).toBe(true);
    expect(guideOffline(at('memory', t)).intent, t).toBe('leave');
  }
});
