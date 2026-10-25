// A slow connection (a headset through a tunnel) can drop a download: try a lazily loaded piece again a few times
// before giving up.
import { lazy, type ComponentType } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same bound as React's own lazy()
export function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    for (let i = 0; ; i++) {
      try { return await load(); } catch (e) { if (i >= 3) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
    }
  });
}
