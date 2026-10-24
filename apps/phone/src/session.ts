import { SESSION_SCOPE } from './backend';

// The phone's session for one room: { code, token, name }. The token is the member credential every call needs.
export type Role = 'family' | 'storyteller' | 'viewer';
export type Session = { code: string; token: string; name: string; role: Role; sample?: boolean };

const KEY = `memorygate.session.v1${SESSION_SCOPE}`;

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    if (typeof s.code !== 'string' || typeof s.token !== 'string' || typeof s.name !== 'string') return null;
    const role: Role = s.role === 'storyteller' || s.role === 'viewer' ? s.role : 'family';
    return { code: s.code, token: s.token, name: s.name, role, sample: s.sample === true };
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null): void {
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
  } catch { /* private mode: the session lasts until the tab closes */ }
}
