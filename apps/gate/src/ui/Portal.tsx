// The first screen: the gate and the companion are the welcome; the words only say what happens next.
// Begin is a real gesture (browsers need one before sound and the microphone), so it also asks for the mic.
import { flow } from '../flow/controller';
import { useGate } from '../state/store';

export function Portal() {
  const guestOf = useGate((s) => s.invite?.host ?? null);
  return (
    <section className="portal" aria-labelledby="portal-h" data-testid="portal">
      <h1 id="portal-h">{guestOf ? `Join ${guestOf} in a memory` : 'Visit a place you remember'}</h1>
      <p className="lede">{guestOf ? 'You’ll see the same place and hear the same companion.' : 'A gentle companion will walk there with you. Talk, or share a photo; nothing to type.'}</p>
      <button type="button" className="pill big glass begin refract" onClick={() => void flow.begin()} data-testid="begin">
        <span className="glow" aria-hidden="true" />
        {guestOf ? 'Join' : 'Begin'}
      </button>
      <p className="fine">The companion listens while you talk and keeps your words with your memories. Sound and the microphone turn on when you begin, and you can rest or stop at any time.</p>
    </section>
  );
}
