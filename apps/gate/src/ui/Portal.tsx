// The first screen: the gate and the companion are the welcome; the words only say what happens next.
// Begin is a real gesture (browsers need one before sound and the microphone), so it also asks for the mic.
// When a visit is already happening nearby (same room), joining it is the first choice: one tap, no code.
import { flow } from '../flow/controller';
import { usePresence } from '../presence/presence';
import { useGate } from '../state/store';

export function Portal() {
  const guestOf = useGate((s) => s.invite?.host ?? null);
  const nearby = usePresence((s) => s.nearby);
  const join = () => {
    if (!nearby) return;
    useGate.getState().set({ invite: { code: nearby.code, key: nearby.key, host: 'the visit' } });
    void flow.begin();
  };
  if (nearby && !guestOf) {
    return (
      <section className="portal" aria-labelledby="portal-h" data-testid="portal">
        <h1 id="portal-h">Join the visit</h1>
        <button type="button" className="pill big glass begin refract" onClick={join} data-testid="join-nearby">
          <span className="glow" aria-hidden="true" />
          Join
        </button>
        <button type="button" className="quiet-link" onClick={() => void flow.begin()} data-testid="begin">Start a new visit</button>
        <a className="quiet-link" href="/?story=red-kite" data-testid="open-red-kite">Explore The Red Kite · two tellings</a>
        <a className="quiet-link" href="/?story=red-kite&objects=1" data-testid="open-object-workshop">Try a place-to-object example</a>
      </section>
    );
  }
  return (
    <section className="portal" aria-labelledby="portal-h" data-testid="portal">
      <h1 id="portal-h">{guestOf ? `Join ${guestOf} in a memory` : 'Visit a place you remember'}</h1>
      <button type="button" className="pill big glass begin refract" onClick={() => void flow.begin()} data-testid="begin">
        <span className="glow" aria-hidden="true" />
        {guestOf ? 'Join' : 'Begin'}
      </button>
      <p className="fine">It listens while you talk and keeps your words, voice and photos with your memories. Rest or stop any time.</p>
      {!guestOf && <a className="quiet-link" href="/?story=red-kite" data-testid="open-red-kite">Explore The Red Kite · two tellings</a>}
      {!guestOf && <a className="quiet-link" href="/?story=red-kite&objects=1" data-testid="open-object-workshop">Try a place-to-object example</a>}
    </section>
  );
}
