// "The proposal on the hill": the world memory showcased in San Francisco. Daniel and Sofia are a fictional sample
// couple who shared it publicly; their words and the album's pictures (album-pictures.mjs proposal) live here, so the
// album (map/world.ts) and the walk-in page (ProposalExperience.tsx) always tell it the same way.

export const PROPOSAL = {
  title: 'The proposal on the hill',
  owners: 'Daniel & Sofia',
  about: 'Golden hour on the hill, shared publicly by Daniel & Sofia. A fictional sample.',
  href: '/?story=proposal',
  words: [
    { who: 'Daniel', quote: 'I carried the ring for three weeks, waiting for a clear evening.', image: '/memories/proposal/1-path.jpg' },
    { who: 'Sofia', quote: 'He said we were just going for a walk. Then he stopped by the old oak.', image: '/memories/proposal/2-ring.jpg' },
    { who: 'Sofia', quote: 'I don’t remember what I said. I remember he was shaking.', image: '/memories/proposal/3-oak.jpg' },
  ],
} as const;
