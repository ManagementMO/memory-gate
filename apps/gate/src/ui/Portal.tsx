// The first screen: the gate and the companion are the welcome; the words only say what happens next.
// Begin is a real gesture (browsers need one before sound and the microphone), so it also asks for the mic.
import { flow } from '../flow/controller';
import { useGate } from '../state/store';

export function Portal() {
  const guestOf = useGate((s) => s.invite?.host ?? null);
  return (
    <section className="portal" aria-labelledby="portal-h" data-testid="portal">
      <h1 id="portal-h">{guestOf ? `Join ${guestOf} in a memory` : 'Visit a place you remember'}</h1>
      <button type="button" className="pill big glass begin refract" onClick={() => void flow.begin()} data-testid="begin">
        <span className="glow" aria-hidden="true" />
        {guestOf ? 'Join' : 'Begin'}
      </button>
      <p className="fine">It listens while you talk and keeps your words, voice and photos with your memories. Rest or stop any time.</p>
    </section>
  );
}
