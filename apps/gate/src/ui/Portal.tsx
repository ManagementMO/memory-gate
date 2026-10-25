// The first screen: the gate and the companion are the welcome; the words only say what happens next.
// Begin is a real gesture (browsers need one before sound and the microphone), so it also asks for the mic.
// When a visit is already happening nearby (same room), joining it is the first choice: one tap, no code.
import { flow } from '../flow/controller';
import { usePresence } from '../presence/presence';
import { useGate } from '../state/store';
import { useRef, useState } from 'react';

export function Portal() {
  const guestOf = useGate((s) => s.invite?.host ?? null);
  const nearby = usePresence((s) => s.nearby);
  const pending = useRef(false);
  const [opening, setOpening] = useState<'visit' | 'meadow' | null>(null);
  const [problem, setProblem] = useState('');
  const start = async (kind: 'visit' | 'meadow', action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setOpening(kind);
    setProblem('');
    try { await action(); }
    catch { setProblem('This visit couldn’t open just now. Please try again.'); }
    finally { pending.current = false; setOpening(null); }
  };
  // The start page is just Begin for now. The examples that sat under it are hidden, still reachable by address
  // (/?story=red-kite, /?story=red-kite&objects=1). To bring them back, render this under Begin again:
  //   <MemoryAddOnsWelcome disabled={!!opening} opening={opening === 'meadow'} onExplore={() => void start('meadow', exploreMeadow)} />
  //   <div className="portal-links">
  //     <a className="quiet-link" href="/?story=red-kite" data-testid="open-red-kite">The Red Kite · two tellings</a>
  //     <a className="quiet-link" href="/?story=red-kite&objects=1" data-testid="open-object-workshop">Try a place-to-object example</a>
  //   </div>
  const join = () => {
    if (!nearby) return;
    useGate.getState().set({ invite: { code: nearby.code, key: nearby.key, host: 'the visit' } });
    void start('visit', () => flow.begin());
  };
  if (nearby && !guestOf) {
    return (
      <section className="portal" aria-labelledby="portal-h" aria-busy={!!opening} data-testid="portal">
        <h1 id="portal-h">Join the visit</h1>
        <button type="button" className="pill big glass begin refract" onClick={join} disabled={!!opening} data-testid="join-nearby">
          <span className="glow" aria-hidden="true" />
          Join
        </button>
        <button type="button" className="quiet-link" onClick={() => void start('visit', () => flow.begin())} disabled={!!opening} data-testid="begin">Start a new visit</button>
        {problem && <p className="portal-problem" role="alert">{problem}</p>}
      </section>
    );
  }
  return (
    <section className="portal" aria-labelledby="portal-h" aria-busy={!!opening} data-testid="portal">
      <h1 id="portal-h">{guestOf ? `Join ${guestOf} in a memory` : 'Visit a place you remember'}</h1>
      {/* What happens first, then the button that agrees to it. */}
      <p className="fine">It listens while you talk and keeps your words, voice and photos with your memories. Rest or stop any time.</p>
      <button type="button" className="pill big glass begin refract" onClick={() => void start('visit', () => flow.begin())} disabled={!!opening} data-testid="begin">
        <span className="glow" aria-hidden="true" />
        {guestOf ? 'Join' : 'Begin'}
      </button>
      {problem && <p className="portal-problem" role="alert">{problem}</p>}
    </section>
  );
}
