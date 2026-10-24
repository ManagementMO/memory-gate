// The perspectives' line to the team's exchange: the same /exchange socket presence already keeps open (see
// presence/spacetime.ts attaching it here). Actions go one at a time (the gateway saves one per connection at a time);
// poses are posted without waiting. When the socket goes away, perspectives carry on locally on this device.
import { applySnapshot, poseClock, poses, useSocial, type Member, type Pose, type SocialSnapshot } from './store';

type Wire = { request: (m: Record<string, unknown>, timeoutMs?: number) => Promise<void>; post: (m: Record<string, unknown>) => void };

let wire: Wire | null = null;
let room: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

export const socialLink = {
  attach(w: Wire, memberId: string, members: Member[], roomId: string) {
    wire = w; room = roomId;
    useSocial.setState({ memberId, members });
  },
  detach() {
    wire = null; room = null;
    poses.clear();
    useSocial.setState({ status: 'local' });
  },
  members(members: Member[]) { useSocial.setState({ members }); },
  /** Everything the gateway pushes that perspectives care about. */
  receive(d: { type?: string; social?: SocialSnapshot; poses?: Pose[]; now?: number }) {
    if (d.type === 'social' && d.social) applySnapshot(d.social);
    if (d.type === 'poses' && d.poses) {
      const now = Date.now();
      if (typeof d.now === 'number') poseClock.offset = d.now - now;
      const seen = new Set<string>();
      for (const p of d.poses) { seen.add(p.memberId); poses.set(p.memberId, { ...p, receivedAt: now }); }
      for (const id of [...poses.keys()]) if (!seen.has(id)) poses.delete(id);
    }
  },
  get live() { return !!wire; },
  /** Connected and holding this visit's perspectives (the first snapshot has arrived). */
  get ready() { return !!wire && useSocial.getState().status === 'live'; },
  get roomId() { return room; },
  /** One action at a time; rejects with the gateway's (already safe) message. */
  request(m: Record<string, unknown>): Promise<void> {
    const run = () => (wire ? wire.request(m) : Promise.reject(new Error('Perspectives are kept on this device only right now.')));
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  },
  post(m: Record<string, unknown>) { wire?.post(m); },
};
