// "Enter in headset": shown only where immersive VR is available (Quest Browser, or the emulator with ?emulate=1).
// Leaving the headset returns to this same page; if the memory is finished, the album is waiting there.
import { useEffect, useState } from 'react';
import { xrStore } from '../scene/xr';
import { flow } from '../flow/controller';
import { useGate } from '../state/store';
import { HeadsetIcon } from './Icons';

export function XrButton() {
  const [supported, setSupported] = useState(false);
  const stage = useGate((s) => s.stage);
  const xr = useGate((s) => s.xr);
  useEffect(() => {
    // Ask a few times: an emulated headset (?emulate=1) and some browsers attach WebXR a moment after load.
    let live = true;
    const check = () => {
      const nav = navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } };
      void nav.xr?.isSessionSupported('immersive-vr').then((ok) => { if (live && ok) setSupported(true); }).catch(() => undefined);
    };
    check();
    const timers = [600, 1600, 3500, 7000].map((ms) => setTimeout(check, ms));
    return () => { live = false; timers.forEach(clearTimeout); };
  }, []);
  if (!supported || xr || stage === 'album') return null;
  return (
    <button type="button" className="pill glass xr-enter" data-testid="enter-vr"
      onClick={() => { if (useGate.getState().stage === 'portal') void flow.begin(); void xrStore.enterVR(); }}>
      <HeadsetIcon /> Enter in headset
    </button>
  );
}
