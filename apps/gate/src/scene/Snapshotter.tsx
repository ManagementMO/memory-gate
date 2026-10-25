// Takes a picture of the place for the album. Reads the canvas right after the frame is drawn (an after-effect, so in
// the same task: preserveDrawingBuffer isn't needed) and scales it down to a JPEG. It must never claim a useFrame
// priority above zero: that tells React Three Fiber this component draws the frame itself, and in the headset (where
// there is no composer) nothing would draw at all.
// In the headset the page's canvas isn't what the wearer sees (a Quest draws straight into its own layer), so there
// the picture is drawn separately, from the wearer's eyes, with the same light and colour as the headset view.
import { addAfterEffect, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { registerSnapshot } from '../flow/moments';

type Job = { width: number; resolve: (b: Blob | null) => void };

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88));
}

/** The headset's view, drawn off-screen from the wearer's eyes (a 16:10 picture, like the page's). */
function headsetPicture(gl: THREE.WebGLRenderer, scene: THREE.Scene, width: number): HTMLCanvasElement | null {
  const w = Math.round(Math.min(width, 1280)), h = Math.round(w * 0.625);
  const eye = gl.xr.getCamera();
  const cam = new THREE.PerspectiveCamera(62, w / h, 0.05, 1000);
  eye.getWorldPosition(cam.position);
  eye.getWorldQuaternion(cam.quaternion);
  cam.updateMatrixWorld(true);
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
  // Treated like the headset's own target, so the renderer tone-maps and encodes colour exactly as for the wearer.
  (target as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const prev = gl.getRenderTarget();
  const xrOn = gl.xr.enabled;
  const pixels = new Uint8Array(w * h * 4);
  try {
    gl.xr.enabled = false; // an off-screen picture, not a headset view
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(scene, cam);
    gl.readRenderTargetPixels(target, 0, 0, w, h, pixels);
  } catch {
    return null;
  } finally {
    gl.setRenderTarget(prev);
    gl.xr.enabled = xrOn;
    target.dispose();
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // rows come bottom-up
  ctx.putImageData(img, 0, 0);
  return c;
}

export function Snapshotter() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const pending = useRef<Job[]>([]);
  useEffect(() => {
    registerSnapshot((opts) => new Promise((resolve) => {
      pending.current.push({ width: opts?.width ?? 1280, resolve });
      setTimeout(() => { const i = pending.current.findIndex((p) => p.resolve === resolve); if (i >= 0) { pending.current.splice(i, 1); resolve(null); } }, 2500);
    }));
  }, []);
  useEffect(() => addAfterEffect(() => {
    if (!pending.current.length) return;
    const jobs = pending.current.splice(0);
    if (gl.xr.isPresenting) {
      for (const job of jobs) {
        const c = headsetPicture(gl, scene, job.width);
        if (c) void toBlob(c).then(job.resolve); else job.resolve(null);
      }
      return;
    }
    const src = gl.domElement;
    for (const job of jobs) {
      try {
        const k = Math.min(1, job.width / src.width);
        const c = document.createElement('canvas');
        c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
        void toBlob(c).then(job.resolve);
      } catch { job.resolve(null); }
    }
  }), [gl, scene]);
  return null;
}
