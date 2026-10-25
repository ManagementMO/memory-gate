// Everything the companion says on its own (the greeting, the nudges, "Here we are"), in English, Spanish and French.
// The conversation picks the line for its current language (flow/controller.ts); Claude's replies arrive already in
// that language. Spanish and French speak to the storyteller as usted / vous. The Spanish is neutral Latin American (the
// families this is for are in California): "escuché", not "he oído"; "video", not "vídeo". The English lines are word
// for word what the companion always said; {name} marks a value filled in when the line is spoken.
import type { Lang } from '../../../../packages/shared/src/language';
import type { PlaceKey } from '../../../../packages/shared/src/places';

export const LINES = {
  welcomeGuest: {
    en: 'Welcome. You’re joining {host}. Whatever you share, they’ll see it too.',
    es: 'Le doy la bienvenida. Se une a {host}. Lo que comparta, también lo verán.',
    fr: 'Bienvenue. Vous rejoignez {host}. Tout ce que vous partagerez, ils le verront aussi.',
  },
  hello: { en: 'Hello. I’m so glad you’re here.', es: 'Hola. Qué alegría que esté aquí.', fr: 'Bonjour. Quel bonheur de vous voir ici.' },
  askMoment: {
    en: 'Is there a moment you’d like to visit today? You can tell me about it, or show me a photo.',
    es: '¿Hay algún momento que le gustaría visitar hoy? Puede contármelo o mostrarme una foto.',
    fr: 'Y a-t-il un moment que vous aimeriez revisiter aujourd’hui ? Vous pouvez me le raconter, ou me montrer une photo.',
  },
  missed: { en: 'I’m sorry, I missed that. Could you say it again?', es: 'Perdone, no lo escuché bien. ¿Podría repetirlo?', fr: 'Pardon, je n’ai pas bien entendu. Pourriez-vous répéter ?' },
  goodbyeGate: { en: 'Of course. Thank you for spending this time with me.', es: 'Por supuesto. Gracias por pasar este rato conmigo.', fr: 'Bien sûr. Merci d’avoir passé ce moment avec moi.' },
  tooLarge: {
    en: 'That one is a little too large for me. A smaller copy would be perfect.',
    es: 'Es un poco grande para mí. Una copia más pequeña sería perfecta.',
    fr: 'Celle-ci est un peu trop grande pour moi. Une copie plus petite serait parfaite.',
  },
  cantOpen: { en: 'I couldn’t open that one. Could you try another?', es: 'No pude abrir ese archivo. ¿Podría probar con otro?', fr: 'Je n’ai pas pu ouvrir celle-ci. Pourriez-vous en essayer une autre ?' },
  loveVideo: { en: 'Oh, I love this.', es: 'Ay, me encanta.', fr: 'Oh, j’adore.' },
  lookPhoto: { en: 'Oh, look at this.', es: 'Ay, mire esto.', fr: 'Oh, regardez ça.' },
  seeCaption: { en: 'I can see {caption}. Where is this place?', es: 'Veo {caption}. ¿Dónde queda este lugar?', fr: 'Je vois {caption}. Où se trouve cet endroit ?' },
  wherePlace: { en: 'Where is this place?', es: '¿Dónde queda este lugar?', fr: 'Où se trouve cet endroit ?' },
  comingBack: { en: 'It’s coming back to me, little by little.', es: 'Poco a poco, va apareciendo.', fr: 'Ça revient, petit à petit.' },
  hereWeAre: { en: 'Here we are.', es: 'Aquí estamos.', fr: 'Nous y voilà.' },
  tellMeMore: {
    en: 'Tell me what else was here, or anything you notice. Say when you’d like to leave.',
    es: 'Cuénteme qué más había aquí, o lo que vaya notando. Avíseme cuando quiera irse.',
    fr: 'Racontez-moi ce qu’il y avait d’autre ici, ou ce que vous remarquez. Dites-moi quand vous voudrez partir.',
  },
  restDefault: { en: 'Of course. Let’s rest here for a moment.', es: 'Por supuesto. Descansemos aquí un momento.', fr: 'Bien sûr. Reposons-nous ici un instant.' },
  resume: { en: 'I’m here whenever you’re ready.', es: 'Aquí estoy, cuando usted quiera.', fr: 'Je suis là, quand vous voulez.' },
  thanksLeaving: {
    en: 'Thank you for taking me there. I’ve kept this moment for you.',
    es: 'Gracias por llevarme allí. Guardé este momento para usted.',
    fr: 'Merci pour ce voyage. J’ai gardé ce moment pour vous.',
  },
  // The room's companion welcoming someone who joined (services/exchange/conversation.mjs): said in each device's language.
  joinedToo: { en: '{name}’s here too. Welcome, {name}.', es: '{name} también está aquí. Le doy la bienvenida, {name}.', fr: '{name} est là aussi. Bienvenue, {name}.' },
  allHere: { en: 'Welcome. Now we’re all here together.', es: 'Bienvenidos. Ahora estamos todos aquí, juntos.', fr: 'Bienvenue. Nous voici tous ensemble.' },
  familyVisiting: { en: '{name} is visiting {place}. Let’s go with them.', es: '{name} está visitando {place}. Vamos también.', fr: '{name} visite {place}. Allons-y aussi.' },
  yourFamily: { en: 'Your family', es: 'Su familia', fr: 'Votre famille' },
  someone: { en: 'Someone', es: 'Alguien', fr: 'Quelqu’un' },
  sentPhoto: { en: '{name} sent a photo. Oh, look at this.', es: '{name} envió una foto. Ay, mire esto.', fr: '{name} a envoyé une photo. Oh, regardez ça.' },
  hereAgain: { en: 'Here we are again.', es: 'Aquí estamos otra vez.', fr: 'Nous revoilà.' },
  whereNext: { en: 'Where would you like to go next?', es: '¿Adónde le gustaría ir ahora?', fr: 'Où aimeriez-vous aller maintenant ?' },
  nudgeMedia: {
    en: 'Take your time. Whenever you’re ready, we can step inside.',
    es: 'Tómese su tiempo. Cuando quiera, podemos entrar.',
    fr: 'Prenez votre temps. Quand vous voulez, nous pouvons entrer.',
  },
  nudgePhoto: {
    en: 'Take your time. If it’s easier, a photo can help us find the way.',
    es: 'Tómese su tiempo. Si le resulta más fácil, una foto puede ayudarnos a encontrar el camino.',
    fr: 'Prenez votre temps. Si c’est plus facile, une photo peut nous aider à trouver le chemin.',
  },
  comeWithMe: { en: 'Come with me.', es: 'Venga conmigo.', fr: 'Venez avec moi.' },
  whoWasThere: { en: 'Who was there with you, back then?', es: '¿Quién estaba ahí con usted en ese entonces?', fr: 'Qui était là avec vous, à l’époque ?' },
  goAsChild: { en: 'As a child, then. Shall we go and see it together?', es: 'Con sus ojos de infancia, entonces. ¿Vamos a verlo juntos?', fr: 'Avec vos yeux d’enfant, alors. Voulez-vous qu’on aille le voir ensemble ?' },
  goWithGrandchild: { en: 'With your grandchild, then. Shall we go and see it together?', es: 'Con su nieto o nieta, entonces. ¿Vamos a verlo juntos?', fr: 'Avec votre petit-enfant, alors. Voulez-vous qu’on aille le voir ensemble ?' },
  seeAsGrandparent: { en: 'Through the grandparent’s eyes now.', es: 'Ahora lo vemos con ojos de abuelo.', fr: 'Maintenant, avec des yeux de grand-parent.' },
  seeAsChild: { en: 'Through the grandchild’s eyes now.', es: 'Ahora lo vemos con ojos de niño.', fr: 'Maintenant, avec des yeux d’enfant.' },
  goTogether: { en: 'Shall we go and see it together?', es: '¿Vamos a verlo juntos?', fr: 'Voulez-vous qu’on aille le voir ensemble ?' },
  nearlyHere: { en: 'It’s nearly here. The place takes a moment on this connection.', es: 'Ya casi llega. El lugar tarda un poco con esta conexión.', fr: 'Il arrive presque. Le lieu met un moment à venir sur cette connexion.' },
  shallWeSee: { en: 'Shall we go and see it?', es: '¿Vamos a verlo?', fr: 'Voulez-vous qu’on aille le voir ?' },
  noHurry: { en: 'There’s no hurry. I’m right here.', es: 'No hay prisa. Aquí estoy.', fr: 'Rien ne presse. Je suis là.' },
  ourVisit: { en: 'Our visit.', es: 'Nuestra visita.', fr: 'Notre visite.' },
} satisfies Record<string, Record<Lang, string>>;

export type LineKey = keyof typeof LINES;

/** A line in the given language, with its {placeholders} filled in. */
export function line(key: LineKey, lang: Lang, vars: Record<string, string> = {}): string {
  return LINES[key][lang].replace(/\{(\w+)\}/g, (hole, name: string) => vars[name] ?? hole);
}

/** The prepared places' first words in Spanish and French (their English ones live with the places themselves). */
export const PLACE_INTROS: Partial<Record<PlaceKey, { es: string; fr: string }>> = {
  courtyard: { es: 'Aquí estamos. Las parras sobre la pérgola, y la piedra tibia.', fr: 'Nous y voilà. La vigne sur la pergola, et la pierre tiède.' },
  'red-kite': { es: 'Aquí estamos. El caminito, y el viejo roble en la curva.', fr: 'Nous y voilà. Le petit chemin, et le vieux chêne au tournant.' },
};
