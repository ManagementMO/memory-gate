import { expect, test } from 'vitest';
import { FALLBACK_REPLY, mockExtract, validate, type ExtractionResult } from '../../packages/shared/src/contract';

const proposal: ExtractionResult = {
  intent: 'propose_object', proposals: [{ object: 'bench', details: [], anchor: 'floor', relation: 'unspecified', where: '', quote: 'bench', confidence: .99 }],
  companion_reply: 'Thank you for sharing that.', reply_translation: '', language: 'en', translation: '',
  flags: { distress: false, private_info: false, instruction_like_text: false },
};

test.each(["I can't remember whether there was a bench.", "I'm not sure if there was a bench.", 'No recuerdo si había un banco.'])(
  'uncertainty is kept as a story, never made into scene evidence: %s', transcript => {
    const out = transcript.startsWith('No recuerdo') ? { ...proposal, language: 'es', translation: "I don't remember if there was a bench.", proposals: [{ ...proposal.proposals[0]!, quote: 'banco' }] } : proposal;
    expect(validate(transcript, out).actions).toEqual([]);
    expect(mockExtract(transcript, ['bench', 'banco']).intent).toBe('none');
  },
);
test.each(['What year was that? Try to remember.', 'You are wrong about the bench.', '¿Recuerda el año exacto?'])(
  'the companion does not quiz or correct the storyteller: %s', reply => {
    expect(validate('There was a bench.', { ...proposal, companion_reply: reply }).reply).toBe(FALLBACK_REPLY);
  },
);
test('a supported visual suggestion does not impose an invented historical era', () => {
  const action = validate('There was a bench.', proposal).actions[0];
  expect(action?.type).toBe('propose_object');
  if (action?.type === 'propose_object') expect(action.generatorPrompt).not.toMatch(/1940|antique|grandma/i);
});
test('the fallback leaves the pace with the storyteller', () => {
  expect(FALLBACK_REPLY).not.toMatch(/\?|remember|recall|try harder/i);
});

test('background architecture is not dropped on the floor as separate story props', () => {
  for (const object of ['wooden pergola', 'green shutters', 'stone wall', 'paving']) {
    const result = validate(`There was a ${object}.`, { ...proposal, proposals: [{ ...proposal.proposals[0]!, object, quote: object }] });
    expect(result.actions).toEqual([]);
    expect(result.dropped.join(' ')).toContain('background context');
  }
  const lamp = validate('There was a floor lamp.', { ...proposal, proposals: [{ ...proposal.proposals[0]!, object: 'floor lamp', quote: 'floor lamp' }] });
  expect(lamp.actions[0]?.type).toBe('propose_object');
});
