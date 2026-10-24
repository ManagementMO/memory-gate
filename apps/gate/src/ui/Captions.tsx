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

export function Captions() {
  const said = useGate((s) => s.companionLine);
  const heard = useGate((s) => s.heardLine);
  const stage = useGate((s) => s.stage);
  const words = said ? said.text.split(/\s+/).filter(Boolean) : [];
  const shown = useRevealed(said?.id, words.length);
  if (stage === 'portal' || stage === 'album') return null;
  return (
    <div className="captions" data-testid="captions">
      <p className="said" aria-live="polite" data-testid="companion-line" data-full={said?.text ?? ''}>
        {words.map((w, i) => (
          <span key={`${said?.id}-${i}`} className={`w ${i < shown ? 'on' : ''}`}>{w}{i < words.length - 1 ? ' ' : ''}</span>
        ))}
      </p>
      <p className="heard" data-interim={heard?.interim ? 'true' : 'false'} data-testid="heard-line">
        {heard ? `“${heard.text}”` : ' '}
      </p>
    </div>
  );
}
