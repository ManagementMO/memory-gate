// Drop a photo or video anywhere while you and the companion are talking.
import { useEffect, useState } from 'react';
import { flow } from '../flow/controller';
import { useGate } from '../state/store';

const accepts = (dt: DataTransfer | null) => !!dt && Array.from(dt.items).some((i) => i.kind === 'file' && /^(image|video)\//.test(i.type));

export function DropZone() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const open = () => { const s = useGate.getState().stage; return s === 'gathering' || s === 'greeting' || s === 'portal'; };
    const enter = (e: DragEvent) => { if (!accepts(e.dataTransfer) || !open()) return; e.preventDefault(); depth++; setOver(true); };
    const overFn = (e: DragEvent) => { if (!accepts(e.dataTransfer) || !open()) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setOver(false); };
    const drop = (e: DragEvent) => {
      depth = 0; setOver(false);
      const f = Array.from(e.dataTransfer?.files ?? []).find((x) => /^(image|video)\//.test(x.type));
      if (!f || !open()) return;
      e.preventDefault();
      void flow.receiveFile(f);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overFn);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return <div className={`dropzone ${over ? 'on' : ''}`} aria-hidden={!over}>Let go to share it</div>;
}
