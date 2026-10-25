// Bring someone in: a QR code their phone camera can open (no codes to type). Their phone joins the same session;
// whatever photo or video they choose arrives here, and they see the same place.
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { inviteLink } from '../backend/client';
import { useGate } from '../state/store';
import { CloseIcon } from './Icons';

export function InviteSheet() {
  const open = useGate((s) => s.inviteOpen);
  const session = useGate((s) => s.session);
  const [svg, setSvg] = useState('');
  const link = session ? inviteLink(session, 'your family') : '';
  useEffect(() => {
    if (!open || !link) return;
    QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#f5f4ff', light: '#00000000' } }).then(setSvg).catch(() => setSvg(''));
  }, [open, link]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') useGate.getState().set({ inviteOpen: false }); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={() => useGate.getState().set({ inviteOpen: false })}>
      <section className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="invite-h" onClick={(e) => e.stopPropagation()} data-testid="invite-sheet">
        <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={() => useGate.getState().set({ inviteOpen: false })}><CloseIcon /></button>
        <h2 id="invite-h">Invite someone to join</h2>
        <p>Point a phone camera here. They’ll join this memory and can send photos or videos from their phone.</p>
        {session ? (
          <div className="qr" aria-label="Invitation QR code" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <p className="muted">Inviting needs this computer’s Memora server. It isn’t reachable right now.</p>
        )}
        {session && <p className="link" data-testid="invite-link">{link}</p>}
      </section>
    </div>
  );
}
