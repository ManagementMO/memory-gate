// Takes a picture of the place for the album. Runs after the frame is drawn (priority after the composer), reads the
// canvas in the same frame (so preserveDrawingBuffer isn't needed) and scales it down to a JPEG.
import { useFrame, useThree } from '@react-three/fiber';
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
  useFrame(() => {
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
  }, 10);
  return null;
}
