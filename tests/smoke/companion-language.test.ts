// The companion in English, Spanish and French: which language the conversation is in, pure and offline.
import { describe, expect, test } from 'vitest';
import { asLang, detectLanguage, deviceLang, initialConversationLanguage, nextConversationLanguage, sameLanguage } from '../../packages/shared/src/language';

describe('language basics', () => {
  test('detects English, Spanish and French sentences', () => {
    expect(detectLanguage('La cometa era roja y mi abuela la hizo con papel de seda')).toBe('es');
    expect(detectLanguage('Le cerf-volant était rouge et ma grand-mère l’avait fait avec du papier')).toBe('fr');
    expect(detectLanguage('The kite was red and my grandmother made it with tissue paper')).toBe('en');
  });
  test('is unsure about short or neutral words', () => {
    for (const t of ['ok', 'mm', 'Rosa', '']) expect(detectLanguage(t), t).toBeNull();
  });
  test('reads codes and device tags', () => {
    expect(asLang('es-MX')).toBe('es'); expect(asLang('FR')).toBe('fr'); expect(asLang('pt')).toBeNull(); expect(asLang(null)).toBeNull();
    expect(deviceLang('fr-CA')).toBe('fr'); expect(deviceLang('de-DE')).toBe('en'); expect(deviceLang(undefined)).toBe('en');
    expect(initialConversationLanguage('auto', 'es-ES')).toBe('es'); expect(initialConversationLanguage('fr', 'en-US')).toBe('fr');
  });
  test('a pinned language always wins', () => {
    expect(nextConversationLanguage('en', 'es', { claimed: 'en', text: 'I want to go home now please' })).toBe('es');
  });
  test('Automatic follows what Claude heard, from three words up', () => {
    expect(nextConversationLanguage('en', 'auto', { claimed: 'fr', text: 'La maison de ma grand-mère' })).toBe('fr');
    expect(nextConversationLanguage('es', 'auto', { claimed: 'en', text: 'ok' })).toBe('es');
    expect(nextConversationLanguage('en', 'auto', { claimed: 'es', text: 'Sí, vamos' })).toBe('en');
  });
  test('a language outside the three never changes the conversation language', () => {
    expect(nextConversationLanguage('es', 'auto', { claimed: 'hi', text: 'मेरी दादी का घर बहुत सुंदर था' })).toBe('es');
  });
  test('without a claim the detector decides, else nothing changes', () => {
    expect(nextConversationLanguage('en', 'auto', { claimed: null, text: 'La cometa era roja y mi abuela la hizo' })).toBe('es');
    expect(nextConversationLanguage('fr', 'auto', { claimed: null, text: 'Rosa Maria Lopez Garcia' })).toBe('fr');
  });
  test('sameLanguage is false only for text confidently in another language', () => {
    expect(sameLanguage('Aquí estamos.', 'es')).toBe(true);
    expect(sameLanguage('Here we are. The little path, and the old oak at the bend.', 'es')).toBe(false);
    expect(sameLanguage('Mm.', 'fr')).toBe(true);
  });
});
