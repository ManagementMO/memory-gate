// Being together in the same room: who else is here, where they pointed, and whether a visit is already happening
// nearby that this device can join in one tap. Fed by <PresenceSync/>; read by the lights in the world and the gate.
import { create } from 'zustand';

export type Person = {
  id: string;
  host: boolean;
  seat: number;
  color: string;
  device: 'headset' | 'phone' | 'desktop';
  /** A "look here" mark: where they tapped (world space) and when (server time). */
  point: { at: number[]; t: number } | null;
};

type PresenceState = {
  others: Person[];
  me: { seat: number; color: string } | null;
  /** Server time minus this device's clock, so marks fade on time whatever the device clock says. */
  offset: number;
  nearby: { code: string; key: string } | null;
  /** This device's own latest mark, shown at once (before the round trip). */
  myPoint: { at: number[]; t: number } | null;
  set: (p: Partial<PresenceState>) => void;
};

export const usePresence = create<PresenceState>((set) => ({
  others: [],
  me: null,
  offset: 0,
  nearby: null,
  myPoint: null,
  set: (p) => set(p),
}));

export const serverNow = () => Date.now() + usePresence.getState().offset;

// For automated checks (like window.__gate): who this page sees, and the nearby offer.
if (typeof window !== 'undefined') (window as unknown as { __presence?: typeof usePresence }).__presence = usePresence;

/** What kind of device this is, for the others (a headset's light can follow its head later). */
export function deviceKind(presenting: boolean): Person['device'] {
  if (presenting || /OculusBrowser|Quest/i.test(navigator.userAgent)) return 'headset';
  return matchMedia('(pointer: coarse)').matches ? 'phone' : 'desktop';
}

/** A tap that wants to be seen ("look here"); PresenceSync sends it with the next heartbeat, at once. */
export const pointBus = { send: null as ((at: number[]) => void) | null };
