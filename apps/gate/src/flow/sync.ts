// Being in a memory together. Everyone in a session watches its latest memory:
//   a guest (who joined from the invitation) follows the host into the place, and sees details added later;
//   the host welcomes a photo a guest sends from their phone, while still at the gate.
import { useQuery } from 'convex/react';
import { useEffect, useRef } from 'react';
import { api } from '../../../../convex/_generated/api';
import { useGate } from '../state/store';
import { flow } from './controller';

export type SharedMemory = NonNullable<ReturnType<typeof useSharedMemory>>;

function useSharedMemory() {
  const session = useGate((s) => s.session);
  return useQuery(api.memories.current, session ? { code: session.code, token: session.token } : 'skip');
}

export function useSessionSync(): void {
  const current = useSharedMemory();
  const session = useGate((s) => s.session);
  const seen = useRef<string>('');
  useEffect(() => {
    if (!current || !session || current.mine) return;
    const key = `${current.id}@${current.updatedAt}`;
    if (key === seen.current) return;
    seen.current = key;
    if (session.role === 'guest') void flow.followHost(current);
    else if (current.mediaUrl) void flow.welcomeGuestPhoto(current);
  }, [current, session]);
}
