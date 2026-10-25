// The few things a showcase holds back so that saying them brings them in ("there was a birdbath", "my dad's rocking
// chair"): items in its scene with a `say` list. Pure, so the flow can ask without loading the scene.
const specs = import.meta.glob('./scenes/*.json', { eager: true, import: 'default' }) as Record<string, { items?: { say?: string[] }[] }>;

/** The held things in this showcase that these words name and that aren't in yet (their item indexes). */
export function heldHeard(name: string, text: string, revealed: number[]): number[] {
  const items = specs[`./scenes/${name}.json`]?.items ?? [];
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ')} `;
  const out: number[] = [];
  items.forEach((it, i) => {
    if (it.say && !revealed.includes(i) && it.say.some((w) => t.includes(` ${w} `) || t.includes(` ${w}s `))) out.push(i);
  });
  return out;
}
