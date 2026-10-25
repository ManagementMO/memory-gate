// The companion in English, Spanish and French: which language the conversation is in, pure and offline.
import { describe, expect, test } from 'vitest';
import { asksToEnter, asksToLeave, guideOffline, languageLines, resolveReply, safeReply, type GuideInput } from '../../packages/shared/src/guide';
import { asLang, detectLanguage, deviceLang, initialConversationLanguage, nextConversationLanguage, sameLanguage } from '../../packages/shared/src/language';

const base: GuideInput = { phase: 'gathering', transcript: '', history: [], media: null, mediaCaption: null, place: null, invitedToEnter: false, turnsInPhase: 0 };

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

describe('the guide in three languages', () => {
  test('leaving is understood in Spanish and French, accents included', () => {
    for (const t of ['Quiero irme', 'Me quiero ir a casa', 'Ya terminé', 'Estoy cansada', 'Adiós', 'Llévame a casa',
      'Je voudrais partir', 'Je suis fatiguée', 'Au revoir', 'On peut s’en aller ?', 'Ramenez-moi à la maison']) expect(asksToLeave(t), t).toBe(true);
  });
  test('memories that mention leaving are not a wish to leave', () => {
    for (const t of ['Dejábamos la puerta abierta cuando nos íbamos', 'Mi abuelo quería irse a México',
      'On partait le dimanche après la messe', 'Il voulait partir en Espagne']) expect(asksToLeave(t), t).toBe(false);
  });
  test('invitations to step through are recognised in each language', () => {
    for (const t of ['¿Vamos allí juntos?', 'On y va ensemble ?', 'Shall we go there together?']) expect(asksToEnter(t), t).toBe(true);
    for (const t of ['Vamos a ver qué más había', 'Aquí estamos.']) expect(asksToEnter(t), t).toBe(false);
  });
  test('the safety filter holds in Spanish and French, and through the English reading', () => {
    for (const t of ['Esto puede curar la demencia.', 'Ce traitement aide la mémoire.', '¿Se acuerda de qué año era?', 'Vous vous souvenez de quelle année c’était ?'])
      expect(safeReply(t, 'fb'), t).toBe('fb');
    expect(safeReply('Qué cortinas tan bonitas.', 'fb')).toBe('Qué cortinas tan bonitas.');
    expect(safeReply('भगवान आपका भला करे', 'fb', 'This medicine will cure your memory loss')).toBe('fb');
    expect(safeReply('Qué bonito.', 'fb', 'How lovely.')).toBe('Qué bonito.');
  });
  test('offline replies come in the conversation language', () => {
    expect(guideOffline({ ...base, language: 'es', transcript: 'Quiero irme', phase: 'memory' })).toMatchObject({ intent: 'leave', reply: 'Gracias por traerme aquí. Guardaré este momento para usted.', language: 'es' });
    expect(guideOffline({ ...base, language: 'es', transcript: 'Descansemos un momento' })).toMatchObject({ intent: 'rest', reply: 'Por supuesto. Descansemos aquí un momento.' });
    expect(guideOffline({ ...base, language: 'fr', transcript: 'J’ai une photo de la maison' })).toMatchObject({ intent: 'offer_photo' });
    expect(guideOffline({ ...base, language: 'es', transcript: 'No sé' }).intent).toBe('offer_invite');
    expect(guideOffline({ ...base, language: 'es', invitedToEnter: true, transcript: 'Sí, vamos' })).toMatchObject({ intent: 'enter', reply: 'Venga conmigo.' });
    expect(guideOffline({ ...base, language: 'fr', invitedToEnter: true, transcript: 'Pas encore' })).toMatchObject({ intent: 'chat', reply: 'Bien sûr. Racontez-m’en plus quand vous voulez.' });
    const long = 'La casa de mi abuela tenía una cocina grande con cortinas amarillas y una mesa de madera';
    expect(guideOffline({ ...base, language: 'es', transcript: long })).toMatchObject({ intent: 'describe', reply: 'Ya casi puedo verlo. ¿Vamos allí juntos?' });
    expect(guideOffline({ ...base, language: 'es', phase: 'memory', transcript: 'Mm' }).reply).toMatch(/^(Mm\. Aquí estoy\.|Tómese su tiempo\.|Le escucho\.)$/);
  });
  test('English offline replies are unchanged', () => {
    const r = guideOffline({ ...base, transcript: 'My grandmother’s kitchen in the morning, with yellow curtains, a round wooden table and her radio on the counter' });
    expect(r).toMatchObject({ intent: 'describe', language: 'en', english: null, replyEnglish: null });
    expect(r.reply).toMatch(/^I can almost see .*Shall we go there together\?$/);
  });
  test('resolveReply: a language outside the three is spoken as is and changes nothing else', () => {
    const r = resolveReply({ ...base, language: 'es', setting: 'auto', transcript: 'मेरी दादी का घर बहुत सुंदर था' },
      { reply: 'कितना सुंदर घर था।', intent: 'chat', place: null, language: 'hi', english: 'My grandmother’s house was very beautiful', replyEnglish: 'What a beautiful house.' });
    expect(r).toMatchObject({ language: 'es', speakIn: 'hi' });
    expect(r.reply.reply).toBe('कितना सुंदर घर था।');
  });
  test('resolveReply: an unsafe reply falls back in the language just heard', () => {
    const r = resolveReply({ ...base, language: 'en', setting: 'auto', transcript: 'La casa de mi abuela tenía una cocina grande' },
      { reply: 'Esto puede curar la demencia.', intent: 'describe', place: null, language: 'es', english: 'My grandmother’s house had a big kitchen', replyEnglish: 'This can cure dementia.' });
    expect(r).toMatchObject({ language: 'es', speakIn: 'es' });
    expect(r.reply.reply).not.toMatch(/curar/);
    expect(sameLanguage(r.reply.reply, 'es')).toBe(true);
  });
  test('resolveReply: a pinned language is what Sonic speaks; no reply means offline in the guessed language', () => {
    expect(resolveReply({ ...base, language: 'fr', setting: 'fr', transcript: 'I loved the garden behind the house' },
      { reply: 'Le jardin derrière la maison, comme c’est joli.', intent: 'describe', place: null, language: 'en', english: '', replyEnglish: 'The garden behind the house, how lovely.' }).speakIn).toBe('fr');
    const off = resolveReply({ ...base, language: 'en', setting: 'auto', transcript: 'La cometa era roja y mi abuela la hizo' }, null);
    expect(off).toMatchObject({ language: 'es', speakIn: 'es' });
    expect(off.reply.language).toBe('es');
  });
  test('the prompt names the language rule for each setting', () => {
    expect(languageLines({ setting: 'es' })).toContain('always reply in Spanish');
    const auto = languageLines({ setting: 'auto', language: 'fr' });
    expect(auto).toContain('language of their latest words');
    expect(auto).toContain('French');
    for (const s of [languageLines({ setting: 'en' }), auto]) expect(s).toContain('reply_english');
  });
});
