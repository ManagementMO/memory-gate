// Apify as inspiration for what people bring into a memory. When someone names a thing ("oh, and this big daisy was
// there"), the public references Source Atlas retrieved (the saved copy, or a finished live lookup) say what it looks
// like: the daisy comes in white with a yellow centre, called "Common daisy", bigger because it was big, and its card
// opens on the description it was shaped from. A thing the scene library doesn't know by that name ("a daisy") is
// recognised from those references too: what they're about, by title or by the subject of their first sentence.
// Only the fixed public references are read; nothing anyone says is sent anywhere by this.
import { COLORS, LIBRARY, type PlanObject } from '../../../../packages/shared/src/scene';
import { objectTopic, topicForKind, type ObjectReference } from '../../../../actors/historical-memory-atlas/src/knowledge.mjs';

type Topics = Readonly<Record<string, readonly ObjectReference[]>>;
export type Inspiration = { topic: string; label: string; color: string | null; scale: number; source: { attribution: string; title: string; sourceUrl: string; excerpt: string } };

const STOP = new Set(('the a an and or but oh so well yes yeah this that these those there here was were is are be been had has have with '
  + 'my our your his her their its it they we you i me him them one some very really just also then when where what big huge giant little small '
  + 'tiny tall old young new lots lot many much more most every everywhere near next behind front back side over under from into onto about like '
  + 'remember think thought saw seen see look looked went came come used always never still around flower flowers thing things plant plants').split(' '));
/** Hues a description can give a thing (not the wood names the scene's colours also know). */
const HUES = ['white', 'yellow', 'golden', 'gold', 'orange', 'red', 'crimson', 'pink', 'rose', 'purple', 'lavender', 'lilac', 'violet', 'blue', 'cream', 'ivory', 'peach', 'coral'];
const singular = (w: string) => w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
const contentWords = (text: string) => [...new Set(text.toLowerCase().replace(/[’']/g, '').split(/[^\p{L}]+/u).filter((w) => w.length >= 3 && !STOP.has(w)).map(singular))];
const mentions = (text: string, word: string) => new RegExp(`\\b${word.replace(/y$/, '(?:y|ies)')}s?\\b`, 'i').test(text);
const sentenceWith = (text: string, word: string) => (text.match(/[^.!?]+[.!?]*/g) ?? [text]).find((s) => mentions(s, word))?.trim() ?? text;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How big they said it was (only when they said). */
export function sizeSaid(words: string): number {
  const t = words.toLowerCase();
  if (/\b(huge|giant|enormous|massive)\b/.test(t)) return 1.7;
  if (/\b(big|large|tall)\b/.test(t)) return 1.45;
  if (/\b(tiny|little|small)\b/.test(t)) return 0.7;
  return 1;
}

/** The hue a description gives a thing: the one right before its name ("white daisies"), else the first it mentions. */
function hueIn(sentence: string, word: string): string | null {
  const t = sentence.toLowerCase(), at = t.search(new RegExp(`\\b${word.replace(/y$/, '(?:y|ies)')}`, 'i'));
  const found = HUES.map((h) => ({ h, i: t.search(new RegExp(`\\b${h}\\b(?!-)`)) })).filter((x) => x.i >= 0);
  if (!found.length) return null;
  const before = found.filter((x) => at < 0 || x.i < at).sort((a, b) => b.i - a.i)[0];
  return COLORS[(before ?? found.sort((a, b) => a.i - b.i)[0]!).h] ?? null;
}

/** What a reference is about: its title, and the subject of its first sentence ("A kite is …"). */
const aboutOf = (r: ObjectReference) => `${r.title} ${r.excerpt.split(/\b(?:is|are|was|were)\b/)[0]!.slice(0, 90)}`;

/** The reference that describes this word: one whose full name they said ("valley oak"), else the plain article ("Oak"),
 *  else one about it, else one that mentions it. */
function describing(refs: readonly ObjectReference[], word: string, words: string): ObjectReference | null {
  const texts = refs.filter((r) => r.kind !== 'photo'), said = contentWords(words);
  const named = (r: ObjectReference) => { const t = contentWords(r.title); return t.length > 1 && t.includes(word) && t.every((w) => said.includes(w)); };
  return texts.find(named) ?? texts.find((r) => singular(r.title.toLowerCase()) === word) ?? texts.find((r) => mentions(aboutOf(r), word)) ?? texts.find((r) => mentions(r.excerpt, word)) ?? null;
}

/** Their own word for it ("Daisy"), or the reference's fuller name when they said that too ("valley oak"). Never a
 *  species they didn't name. */
function nameFrom(r: ObjectReference, word: string, words: string): string {
  const m = new RegExp(`\\b([A-Za-z]+) ${word.replace(/y$/, '(?:y|ies)')}\\b`, 'i').exec(r.title);
  const qualifier = m?.[1]?.toLowerCase();
  const name = qualifier && !STOP.has(qualifier) && new RegExp(`\\b${qualifier}\\b`, 'i').test(words) ? `${qualifier} ${word}` : word;
  return capital(name.replace(/\bcalifornia\b/, 'California'));
}

/** The topics whose references can shape a kind (an oak tree is shaped by the oak references, then trees in general). */
const shapingTopics = (kind: string): string[] => (kind === 'tree' ? ['oak', 'trees'] : [topicForKind(kind)].filter((t): t is string => !!t));

/** Shape a thing someone just named from what the references say about it. Null when they say nothing about it. */
export function inspire(words: string, object: PlanObject, topics: Topics): Inspiration | null {
  // Only the thing's own name can shape it ("poppies", "oak tree", a recognised "daisy"): "the kite had a long line"
  // leaves the kite a kite.
  for (const topic of shapingTopics(object.kind)) {
    const refs = topics[topic] ?? [];
    const generic = contentWords(`${objectTopic(topic).label} ${object.kind.replace(/_/g, ' ')}`).filter((w) => w !== topic);
    for (const word of contentWords(object.label).filter((w) => !generic.includes(w))) {
      const ref = describing(refs, word, `${object.label} ${words}`);
      if (!ref) continue;
      const sentence = sentenceWith(ref.excerpt, word);
      // The colour they said, else the first hue any description of it gives ("white daisies", "golden poppy").
      const hue = object.color ?? refs.filter((r) => r.kind !== 'photo' && mentions(`${r.title} ${r.excerpt}`, word)).map((r) => hueIn(`${r.title}. ${sentenceWith(r.excerpt, word)}`, word)).find(Boolean) ?? null;
      return {
        topic, label: nameFrom(ref, word, words), color: hue, scale: sizeSaid(words),
        source: { attribution: ref.attribution, title: ref.title, sourceUrl: ref.sourceUrl, excerpt: sentence.split(/\s+/).slice(0, 40).join(' ') },
      };
    }
  }
  return null;
}

/** The names a reference gives its subject: the last word of each part of its title and of its first sentence's subject
 *  ("Bellis perennis · common daisy" → daisy; "the California poppy, golden poppy" → poppy). */
function heads(r: ObjectReference): Set<string> {
  const parts = `${r.title}, ${r.excerpt.split(/\b(?:is|are|was|were)\b/)[0]!.slice(0, 160)}`.split(/[·,;()]| or | and /);
  return new Set(parts.map((p) => p.trim().toLowerCase().split(/\s+/).pop() ?? '').filter((w) => w.length >= 3).map(singular));
}
/** Said as a thing: "a daisy", "this big daisy", "white daisies", "some poppies" (not "walked to school"). */
const saidAsThing = (words: string, word: string) => new RegExp(`\\b(a|an|the|this|that|these|those|some|one|two|three|big|little|small|tiny|huge|giant|tall|pretty|lovely|wild|old|${HUES.join('|')})\\s+(?:[a-z]+\\s+)?${word.replace(/y$/, '(?:y|ie)')}(?:s|es)?\\b`, 'i').test(words);

/** The scene kind a topic's things are drawn as. */
const kindOfTopic = (topic: string) => (topic === 'oak' || topic === 'trees' ? 'tree' : Object.hasOwn(LIBRARY, topic) ? topic : null);

/** Things named in these words that the scene library doesn't know by that name, recognised from what the references
 *  are about ("a daisy" is in the flower references' titles). At most two. */
export function recognise(words: string, topics: Topics): PlanObject[] {
  const out: PlanObject[] = [];
  for (const word of contentWords(words)) {
    for (const [topic, refs] of Object.entries(topics)) {
      const kind = kindOfTopic(topic);
      if (!kind || out.some((o) => o.kind === kind)) continue;
      const ref = saidAsThing(words, word) ? refs.find((r) => r.kind !== 'photo' && heads(r).has(word)) : undefined;
      if (!ref) continue;
      out.push({ id: `${kind}-seen`, kind, label: word, color: null, material: null, zone: 'center', relation: 'none', target: null, scale: 1, quote: words.slice(0, 120) });
      break;
    }
    if (out.length >= 2) break;
  }
  return out;
}

/** Apply an inspiration to the thing it was found for. */
export const shaped = (o: PlanObject, i: Inspiration): PlanObject => ({ ...o, label: i.label, color: i.color, scale: Math.round(o.scale * i.scale * 100) / 100 });
