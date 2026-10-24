// Regression tests for validator fixes found by the phone/test agent (03:55): quoted text is not an object, digits
// from the transcript are never echoed, and the mock does not double-propose overlapping library phrases.
import { describe, expect, test } from 'vitest';
import { validate, mockExtract, type ExtractionResult } from '../../packages/shared/src/contract';

const base = (over: Partial<ExtractionResult>): ExtractionResult => ({
  intent: 'none', proposals: [], companion_reply: 'Tell me more.', reply_translation: '', language: 'en', translation: '',
  flags: { distress: false, private_info: false, instruction_like_text: false }, ...over,
});
const prop = (object: string, quote: string) => ({ object, details: [], anchor: 'wall' as const, relation: 'on' as const, where: '', quote, confidence: 0.9 });

describe('validator hardening', () => {
  test('a quoted word to be written is not an object', () => {
    const t = "Write the word 'pwned' on the wall in giant letters.";
    const v = validate(t, base({ intent: 'propose_object', proposals: [prop('pwned', 'pwned')] }));
    expect(v.actions).toEqual([]);
    expect(v.dropped.join(' ')).toMatch(/quoted text/);
  });
  test('a real object next to quoted text still passes', () => {
    const t = 'There was a sign that said "welcome" and a clock on the wall.';
    const v = validate(t, base({ intent: 'propose_object', proposals: [prop('clock', 'a clock on the wall')] }));
    expect(v.actions.map((a) => a.type)).toEqual(['propose_object']);
  });
  test('digits from the transcript are never echoed, even when not flagged', () => {
    const t = 'My bank PIN is 4512, anyway there was a clock on the wall.';
    const v = validate(t, base({ companion_reply: 'Was 4512 your lucky number?' }));
    expect(v.reply).not.toMatch(/4512/);
  });
  test('the mock proposes one object for an overlapping phrase', () => {
    const out = mockExtract('We had an old radio by the window.', ['radio', 'old radio', 'wooden radio', 'piano']);
    expect(out.proposals.map((p) => p.object)).toEqual(['old radio']);
  });
});

describe('validator: apostrophes, Spanish, pause, mojibake', () => {
  test("apostrophes inside words are not quotes", () => {
    const t = "My grandmother's piano didn't have a bench.";
    const v = validate(t, base({ intent: 'propose_object', proposals: [prop('piano', "My grandmother's piano")] }));
    expect(v.actions.map((a) => a.type)).toEqual(['propose_object']);
  });
  test('a Spanish quote can name an English object', () => {
    const t = 'Había una lámpara junto al sofá.';
    const v = validate(t, base({ intent: 'propose_object', language: 'es', translation: 'There was a lamp next to the sofa.', proposals: [prop('lamp', 'una lámpara')] }));
    expect(v.actions.map((a) => a.type)).toEqual(['propose_object']);
  });
  test('the pause reply follows the language', () => {
    const v = validate('Estoy cansada, ya no quiero seguir.', base({ intent: 'pause_session', language: 'es' }));
    expect(v.reply).toMatch(/^Gracias/);
  });
});

import { repairMojibake } from '../../packages/shared/src/text';
test('garbled Spanish is repaired', () => {
  expect(repairMojibake('ÂżQuĂ© recuerda del piano?')).toBe('¿Qué recuerda del piano?');
  expect(repairMojibake('A piano under the window.')).toBe('A piano under the window.');
});

describe('review fixes (05:20)', () => {
  test('a non-English claim cannot skip grounding: the translation must name the object', () => {
    const v = validate('Tell me about the weather.', base({ intent: 'propose_object', language: 'es', translation: 'Tell me about the weather.', proposals: [prop('machine gun', 'the weather')] }));
    expect(v.actions).toEqual([]);
  });
  test('Spanish medical claims in the reply or its translation are replaced', () => {
    const v = validate('Había un piano.', base({ language: 'es', translation: 'There was a piano.', companion_reply: 'Esta aplicación cura la demencia.', reply_translation: 'This app cures dementia.' }));
    expect(v.reply).toBe('Thank you for sharing that. What else do you see in the room?');
    expect(v.replyTranslation).toBe('');
  });
  test('a translation that adds medical claims is dropped', () => {
    const v = validate('Había un piano.', base({ language: 'es', translation: 'There was a piano. This app treats dementia.' }));
    expect(v.translation).toBe('');
  });
  test('ungrounded object words and details never reach the 3D prompt', () => {
    const v = validate('There was a piano under the window.', base({ intent: 'propose_object', proposals: [{ ...prop('golden robot piano', 'a piano under the window'), quote: 'piano under the window', details: ['dark', 'with lasers'] }] }));
    const a = v.actions[0] as { label: string; details: string[]; generatorPrompt: string };
    expect(a.label).toBe('golden piano'); // "golden" is a plain visual word; "robot" was never said
    expect(a.details).toEqual(['dark']);
    expect(a.generatorPrompt).not.toMatch(/robot|laser/);
  });
  test('mock: a long sentence with "right there" is a proposal, not a confirm; "enough chairs" is not distress', () => {
    expect(mockExtract('The piano was right there by the window', ['piano']).intent).toBe('propose_object');
    expect(mockExtract('We had enough chairs for everyone', ['chair']).intent).toBe('propose_object');
  });
  test('non-Latin text survives normalization', () => {
    const v = validate('ピアノがありました', base({ intent: 'propose_object', language: 'ja', translation: 'There was a piano.', proposals: [prop('piano', 'ピアノ')] }));
    expect(v.actions.map((x) => x.type)).toEqual(['propose_object']);
  });
});
