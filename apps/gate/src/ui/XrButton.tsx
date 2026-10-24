// "Enter in headset": shown only where immersive VR is available (Quest Browser, or the emulator with ?emulate=1).
// Leaving the headset returns to this same page; if the memory is finished, the album is waiting there.
import { useEffect, useState } from 'react';
import { xrStore } from '../scene/xr';
import { useGate } from '../state/store';
import { HeadsetIcon } from './Icons';

export function XrButton() {
  const [supported, setSupported] = useState(false);
  const stage = useGate((s) => s.stage);
  const xr = useGate((s) => s.xr);
  useEffect(() => {
    const nav = navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } };
    void nav.xr?.isSessionSupported('immersive-vr').then(setSupported).catch(() => setSupported(false));
  }, []);
  if (!supported || xr || stage === 'album') return null;
  return (
    <button type="button" className="pill glass xr-enter" onClick={() => void xrStore.enterVR()} data-testid="enter-vr">
      <HeadsetIcon /> Enter in headset
    </button>
  );
}
