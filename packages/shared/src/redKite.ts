/** Original fictional script. These are examples, never recovered memories or recorded family speech. */
export type Perspective = 'elena' | 'rosa';
export type KiteDecision = { beat: number; decision: 'use' | 'leave' };
export type KiteLine = { quote: string; note: string; proposal?: { identity: true; color?: 'red' | 'orange'; ribbon?: 'cream' } };
export const RED_KITE_TELLINGS: Record<Perspective, { name: string; place: string; introduction: string; lines: KiteLine[] }> = {
  elena: {
    name: 'Elena', place: 'Along the path', introduction: 'The pull of the string. The whole sky ahead.',
    lines: [
      { quote: 'Rosa and I used to run down that little path. There was an old oak at the bend.', note: 'An afternoon in California, told from the open clearing.' },
      { quote: "We had a kite. I can't remember its color.", note: 'A kite is named; its color can stay open.', proposal: { identity: true } },
      { quote: 'It was red. Rosa tied a cream ribbon to the tail.', note: 'Her description can become an illustration, with her words attached.', proposal: { identity: true, color: 'red', ribbon: 'cream' } },
      { quote: "I don't remember what we did after. I remember we didn't want to go home.", note: 'A detail can stay open. The afternoon still belongs to her.' },
    ],
  },
  rosa: {
    name: 'Rosa', place: 'Beside the oak', introduction: 'The shade of the oak. Her friend in the sunlight.',
    lines: [
      { quote: 'From beside the oak, I could see the whole clearing. Elena was always the first to run into the wind.', note: 'The same afternoon, with a different person at its center.' },
      { quote: "I was holding the end of the kite's string while she ran down the path.", note: 'Her own recollection names the kite; it does not borrow Elena\'s color.', proposal: { identity: true } },
      { quote: 'The kite looked orange to me in that light. I remember the cream ribbon twisting.', note: 'Both descriptions can stay. This is Rosa\'s illustration.', proposal: { identity: true, color: 'orange', ribbon: 'cream' } },
      { quote: 'What I remember most is her laughing every time the wind caught it.', note: 'One afternoon. Different things stayed with each of them.' },
    ],
  },
};

export function resolveKiteLook(key: Perspective, progress: { decisions: KiteDecision[]; sourceIds: string[] }) {
  let visible = false;
  let color: 'red' | 'orange' | null = null;
  let ribbon: 'cream' | null = null;
  let identitySourceId: string | null = null, colorSourceId: string | null = null, ribbonSourceId: string | null = null;
  for (const d of [...progress.decisions].sort((a, b) => a.beat - b.beat)) {
    if (d.decision !== 'use') continue;
    const p = RED_KITE_TELLINGS[key].lines[d.beat]?.proposal;
    const source = progress.sourceIds[d.beat] ?? null;
    if (!p || !source) continue;
    visible = true; identitySourceId ??= source;
    if (p.color) { color = p.color; colorSourceId = source; }
    if (p.ribbon) { ribbon = p.ribbon; ribbonSourceId = source; }
  }
  return { visible, color, ribbon, identitySourceId, colorSourceId, ribbonSourceId };
}
