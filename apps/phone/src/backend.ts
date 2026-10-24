// Where the browser reaches Convex. By default that is this page's own origin: the Vite dev/preview server proxies
// /api (HTTP + WebSocket) to the local backend, so a phone on the Wi-Fi works even though the backend only listens on
// the computer. `?convex=<url>` overrides it for debugging; VITE_CONVEX_URL sets it for a cloud build.
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]|::1)$/i;

function httpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin + url.pathname.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

const override = httpUrl(new URLSearchParams(window.location.search).get('convex'));
export const CONVEX_URL = override ?? httpUrl(import.meta.env.VITE_CONVEX_URL as string | undefined) ?? window.location.origin;

/** Sessions are stored per backend: a crafted ?convex= link can never read (and send away) the real member token. */
export const SESSION_SCOPE = override ? `@${override}` : '';

/** Storage URLs come back as http://127.0.0.1:3210/api/storage/...; point them at the origin this page uses for Convex. */
export function fileUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    const base = new URL(CONVEX_URL);
    if (LOOPBACK.test(url.hostname) && url.origin !== base.origin && url.pathname.startsWith('/api/')) {
      return `${base.origin}${url.pathname}${url.search}`;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export const isLoopbackHost = () => LOOPBACK.test(window.location.hostname);

/** The Quest opens the headset app on this computer's network address. The main link is the production build (:4173):
 * the dev server (:8081) reloads the page, ending XR, whenever its live-reload socket drops (Wi-Fi blip, headset sleep). */
export function headsetLink(code: string, key?: string | null): { url: string; devUrl: string; onLan: boolean } {
  const host = isLoopbackHost() ? 'localhost' : window.location.hostname;
  const q = `?room=${code}${key ? `&key=${key}` : ''}`; // the family key lets the headset join as the storyteller
  return { url: `https://${host}:4173/${q}`, devUrl: `https://${host}:8081/${q}`, onLan: !isLoopbackHost() };
}

/** A phone link other family members can open to join (this page's origin plus ?room=). */
export function joinLink(code: string, key?: string | null): string {
  return `${window.location.origin}/?room=${code}${key ? `&key=${key}` : ''}`;
}
