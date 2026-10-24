// What the companion says, revealed at the pace it's spoken, and what you said, as you say it.
// The companion's line is the largest text in the experience; your words sit quieter beneath it.
import { useEffect, useState } from 'react';
import { useGate } from '../state/store';

/** Reveal words at roughly speaking pace (≈ 2.6 words/s), so reading never runs ahead of the voice. */
function useRevealed(id: number | undefined, words: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!id) return;
    let i = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setN(words); return; }
    const t = setInterval(() => { i += 1; setN(i); if (i >= words) clearInterval(t); }, 360);
    setN(1);
    return () => clearInterval(t);
  }, [id, words]);
  return n;
}

/**
 * Where each caption page starts: a sentence (or, in a long sentence, a phrase) at a time, so the words on screen
 * stay within two lines and never reach the companion above them.
 */
function pageStarts(words: string[], max = 10): number[] {
  const starts = [0];
  let count = 0;
  for (let i = 0; i < words.length - 1; i++) {
    count += 1;
    const w = words[i]!;
    const sentenceEnd = /[.!?…]["”’)]*$/.test(w);
    const pause = /[,;:—]$/.test(w);
    if ((sentenceEnd && count >= 3) || (pause && count >= 6) || count >= max) { starts.push(i + 1); count = 0; }
  }
  return starts;
}

export function Captions() {
  const said = useGate((s) => s.companionLine);
  const heard = useGate((s) => s.heardLine);
  const stage = useGate((s) => s.stage);
  const words = said ? said.text.split(/\s+/).filter(Boolean) : [];
  const shown = useRevealed(said?.id, words.length);
  if (stage === 'portal' || stage === 'album') return null;
  const starts = pageStarts(words);
  const page = starts.filter((st) => st <= Math.max(0, shown - 1)).length - 1;
  const from = starts[page] ?? 0;
  const to = starts[page + 1] ?? words.length;
  return (
    <div className="captions" data-testid="captions">
      <p className="visually-hidden" aria-live="polite">{said?.text ?? ''}</p>
      <p className="said" aria-hidden="true" data-testid="companion-line" data-full={said?.text ?? ''}>
        {words.slice(from, to).map((w, j) => {
          const i = from + j;
          return <span key={`${said?.id}-${i}`} className={`w ${i < shown ? 'on' : ''}`}>{w}{i < to - 1 ? ' ' : ''}</span>;
        })}
      </p>
      <p className="heard" data-interim={heard?.interim ? 'true' : 'false'} data-testid="heard-line">
        {heard ? `“${heard.text}”` : ' '}
      </p>
    </div>
  );
}
