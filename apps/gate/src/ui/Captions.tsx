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

/**
 * Crossing into a memory nothing new is said for a while (the walk through the palace, then the place forming): the
 * last line ("Come with me.") fades a couple of seconds after it has been said, instead of hanging over the whole
 * crossing. Everywhere else a line stays until the next one, to be read at ease.
 */
export function useFadedInCrossing(): boolean {
  const said = useGate((s) => s.companionLine);
  const crossing = useGate((s) => s.stage === 'entering' || s.stage === 'forming');
  const [faded, setFaded] = useState<number | null>(null);
  useEffect(() => {
    if (!crossing || !said) return;
    const words = said.text.split(/\s+/).filter(Boolean).length;
    const t = setTimeout(() => setFaded(said.id), Math.max(0, said.at + (words / 2.6) * 1000 + 2500 - performance.now()));
    return () => clearTimeout(t);
  }, [crossing, said]);
  return crossing && !!said && faded === said.id;
}

export function Captions() {
  const said = useGate((s) => s.companionLine);
  const faded = useFadedInCrossing();
  const heard = useGate((s) => s.heardLine);
  const spoken = useGate((s) => s.spoken);
  const translations = useGate((s) => s.translatedMemories);
  const stage = useGate((s) => s.stage);
  // Between your last word and the companion's reply: a quiet sign that it heard you and is thinking.
  const thinking = useGate((s) => s.mood === 'thinking');
  const words = said ? said.text.split(/\s+/).filter(Boolean) : [];
  const shown = useRevealed(said?.id, words.length);
  if (stage === 'portal' || stage === 'album') return null;
  const starts = pageStarts(words);
  const page = starts.filter((st) => st <= Math.max(0, shown - 1)).length - 1;
  const from = starts[page] ?? 0;
  const to = starts[page + 1] ?? words.length;
  return (
    <div className="captions" data-testid="captions">
      <p className="visually-hidden" lang={said?.language ?? spoken} aria-live="polite">{said?.text ?? ''}</p>
      <p className={`said${faded ? ' faded' : ''}`} lang={said?.language ?? spoken} aria-hidden="true" data-testid="companion-line" data-full={said?.text ?? ''}>
        {words.slice(from, to).map((w, j) => {
          const i = from + j;
          return <span key={`${said?.id}-${i}`} className={`w ${i < shown ? 'on' : ''}`}>{w}{i < to - 1 ? ' ' : ''}</span>;
        })}
      </p>
      {translations.length > 0 && <div className="memory-translations" role="region" aria-label="English translations" aria-live="polite" tabIndex={0} data-testid="memory-translations">
        {translations.map((memory) => <div key={memory.id} className="memory-translation">
          <p className="translation-speaker">{memory.name}</p>
          <p className="translation-original" lang={memory.language ?? undefined}>“{memory.text}”</p>
          <p className="translation-english" lang="en" data-testid="memory-english">
            {memory.english ? <>In English: “{memory.english}”</> : 'English translation is unavailable right now.'}
          </p>
        </div>)}
      </div>}
      <p className="heard" data-interim={heard?.interim ? 'true' : 'false'} data-testid="heard-line">
        {heard ? `“${heard.text}”` : ' '}
        {heard && !heard.interim && thinking && <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>}
      </p>
    </div>
  );
}
