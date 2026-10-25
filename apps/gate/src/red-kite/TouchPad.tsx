import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { WalkInput } from './navigation';

export function TouchPad({ input, disabled }: { input: RefObject<WalkInput>; disabled: boolean }) {
  const [knob, setKnob] = useState([0, 0]), active = useRef<number | null>(null), button = useRef<HTMLButtonElement>(null);
  const stop = () => { active.current = null; input.current = { right: 0, forward: 0 }; setKnob([0, 0]); };
  useEffect(() => { if (disabled) stop(); }, [disabled]);
  useEffect(() => () => { input.current = { right: 0, forward: 0 }; }, [input]);
  function move(e: PointerEvent<HTMLButtonElement>) {
    if (active.current !== e.pointerId || disabled) return;
    const bounds = e.currentTarget.getBoundingClientRect(), x = (e.clientX - bounds.left - bounds.width / 2) / 28, y = (e.clientY - bounds.top - bounds.height / 2) / 28;
    const scale = Math.max(1, Math.hypot(x, y));
    input.current = { right: x / scale, forward: -y / scale }; setKnob([x / scale * 20, y / scale * 20]);
  }
  return <button ref={button} className="rk-touchpad" data-testid="walk-pad" aria-label="Hold and slide to walk" disabled={disabled}
    onPointerDown={e => { if (disabled || active.current !== null) return; active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
    onPointerMove={move} onPointerUp={e => { if (active.current === e.pointerId) { e.currentTarget.releasePointerCapture(e.pointerId); stop(); } }}
    onPointerCancel={stop} onLostPointerCapture={stop}>
    <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27 13l5-5 5 5M27 51l5 5 5-5M13 27l-5 5 5 5M51 27l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} /><small>Walk</small>
  </button>;
}
