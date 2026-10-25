// The perspectives' line to the team's exchange: the same /exchange socket presence already keeps open (see
// presence/spacetime.ts attaching it here). Actions go one at a time (the gateway saves one per connection at a time);
// poses are posted without waiting. When the socket goes away, perspectives carry on locally on this device.
// The room's companion (one conversation with everyone in the visit) talks over it too: its lines and "stop" come
// in as pushes (onVoice), and what a microphone heard goes out as a call that answers whose words they were.
import { applySnapshot, poseClock, poses, useSocial, type Member, type Pose, type SocialSnapshot } from './store';

type Wire = { request: (m: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>; post: (m: Record<string, unknown>) => void };
type VoicePush = { type: 'companion' | 'hush' | 'translation'; [k: string]: unknown };

let wire: Wire | null = null;
let room: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
let voiceListener: ((d: VoicePush) => void) | null = null;

export const socialLink = {
  attach(w: Wire, memberId: string, members: Member[], roomId: string) {
    wire = w; room = roomId;
    useSocial.setState({ memberId, members });
  },
  /** Only the connection that attached can detach (a stale one closing late leaves the current one alone). */
  detach(w: Wire) {
    if (w !== wire) return;
    wire = null; room = null;
    poses.clear();
    useSocial.setState({ status: 'local' });
  },
  members(members: Member[]) { useSocial.setState({ members }); },
  /** Everything the gateway pushes that perspectives care about. */
  receive(d: { type?: string; social?: SocialSnapshot; poses?: Pose[]; now?: number }) {
    if (d.type === 'social' && d.social) applySnapshot(d.social);
    if ((d.type === 'companion' || d.type === 'hush' || d.type === 'translation') && voiceListener) voiceListener(d as VoicePush);
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
    const next = queue.then(run, run).then(() => undefined);
    queue = next.catch(() => undefined);
    return next;
  },
  /** Straight away, beside the one-at-a-time actions (a turn the companion is weighing never holds up a story),
   *  resolving with the gateway's answer. */
  call(m: Record<string, unknown>, timeoutMs = 8000): Promise<unknown> {
    return wire ? wire.request(m, timeoutMs) : Promise.reject(new Error('The room’s companion isn’t connected.'));
  },
  post(m: Record<string, unknown>) { wire?.post(m); },
  /** The room's companion: its lines and "stop talking" (one listener: the conversation, flow/companion.ts). */
  onVoice(fn: (d: VoicePush) => void) { voiceListener = fn; },
};
