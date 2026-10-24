// Takes a picture of the place for the album. Reads the canvas right after the frame is drawn (an after-effect, so in
// the same task: preserveDrawingBuffer isn't needed) and scales it down to a JPEG. It must never claim a useFrame
// priority above zero: that tells React Three Fiber this component draws the frame itself, and in the headset (where
// there is no composer) nothing would draw at all.
import { addAfterEffect, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { registerSnapshot } from '../flow/moments';

export function Snapshotter() {
  const gl = useThree((s) => s.gl);
  const pending = useRef<{ width: number; resolve: (b: Blob | null) => void }[]>([]);
  useEffect(() => {
    registerSnapshot((opts) => new Promise((resolve) => {
      pending.current.push({ width: opts?.width ?? 1280, resolve });
      setTimeout(() => { const i = pending.current.findIndex((p) => p.resolve === resolve); if (i >= 0) { pending.current.splice(i, 1); resolve(null); } }, 2500);
    }));
  }, []);
  useEffect(() => addAfterEffect(() => {
    if (!pending.current.length) return;
    const jobs = pending.current.splice(0);
    const src = gl.domElement;
    for (const job of jobs) {
      try {
        const k = Math.min(1, job.width / src.width);
        const c = document.createElement('canvas');
        c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
        c.toBlob((b) => job.resolve(b), 'image/jpeg', 0.88);
      } catch { job.resolve(null); }
    }
  }), [gl]);
  return null;
}
