import { useEffect, useState } from 'react';
import { useConvexConnectionState } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { spacedCode } from './format';
import { copyText, useHashRoute, useLiveQuery, useLongPress, useNow } from './hooks';
import { Admin } from './screens/Admin';
import { Consent } from './screens/Consent';
import { Live } from './screens/Live';
import { Memories } from './screens/Memories';
import { Photo } from './screens/Photo';
import { Welcome } from './screens/Welcome';
import { loadSession, saveSession, type Session } from './session';
import { Loading, Notice, ToastProvider, useToast } from './ui';

const ROUTES = ['story', 'memories', 'photo', 'consent', 'admin'] as const;
type Route = (typeof ROUTES)[number];
const HEADSET_FRESH_MS = 20_000;

function ConnectionBanner() {
  const state = useConvexConnectionState();
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setGraceOver(true), 4000); return () => window.clearTimeout(id); }, []);
  if (state.isWebSocketConnected) return null;
  if (!state.hasEverConnected && !graceOver) return null;
  return (
    <div className="conn-banner" role="status" data-testid="disconnected">
      {state.hasEverConnected
        ? 'Connection lost. Reconnecting… Anything you tap is sent when it’s back.'
        : 'Can’t reach the room yet. Check that this phone is on the same Wi-Fi as the computer running Memory Gate.'}
    </div>
  );
}

function RoomShell({ session, onLeave }: { session: Session; onLeave: (notice?: string) => void }) {
  const toast = useToast();
  const [route, go] = useHashRoute<Route>(ROUTES, 'story');
  const now = useNow(2000);
  const { data: view, problem } = useLiveQuery(api.rooms.get, { code: session.code, token: session.token });
  const longPress = useLongPress(() => go('admin'));

  if (problem && (problem.code === 'NOT_A_MEMBER' || problem.code === 'ROOM_NOT_FOUND')) {
    return (
      <main className="screen narrow" data-testid="room-gone">
        <p className="eyebrow">Memory Gate</p>
        <Notice tone="warn" title="This room isn’t available any more">
          It may have been deleted, or this phone was removed from it. You can join again with a code, or create a new room.
        </Notice>
        <button type="button" className="btn btn-primary btn-wide" onClick={() => onLeave()} data-testid="room-gone-leave">Start again</button>
      </main>
    );
  }
  if (problem) {
    return (
      <main className="screen narrow" data-testid="room-error">
        <Notice tone="error" title="Something went wrong">{problem.message}</Notice>
        <button type="button" className="btn btn-wide" onClick={() => window.location.reload()}>Reload</button>
      </main>
    );
  }
  if (!view) return <><ConnectionBanner /><Loading /></>;

  const seen = view.room.headsetLastSeenAt;
  const headsetConnected = seen !== null && now - seen < HEADSET_FRESH_MS;
  const isOwner = view.me.isOwner;

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="room-title" data-testid="room-title" {...(isOwner ? longPress : {})} title={isOwner ? 'Long-press for room settings' : undefined}>
            {view.room.title}
          </h1>
          {isOwner && (
            <button type="button" className="btn btn-icon" aria-label="Room settings" data-testid="admin-open" onClick={() => go('admin')}>⋯</button>
          )}
        </div>
        <div className="topbar-row">
          <button type="button" className="code-btn" data-testid="room-code" data-code={view.room.code}
            onClick={async () => toast.say((await copyText(view.room.code)) ? 'Room code copied.' : `Room code: ${view.room.code}`, 'ok')}>
            <span className="code-label">Room code</span>
            <span className="code-value">{spacedCode(view.room.code)}</span>
            <span className="visually-hidden">, tap to copy</span>
          </button>
          <p className={`headset-status ${headsetConnected ? 'on' : 'off'}`} data-testid="headset-status" data-connected={headsetConnected ? 'yes' : 'no'}>
            <span className="dot" aria-hidden="true" />
            {headsetConnected ? 'Headset connected' : 'Headset not connected'}
          </p>
        </div>
        <nav className="tabs" aria-label="Screens">
          {(['story', ...(view.me.role !== 'viewer' ? ['memories' as const] : []), 'photo', 'consent'] as const).map((r) => (
            <button key={r} type="button" className={`tab ${route === r ? 'tab-on' : ''}`} aria-current={route === r ? 'page' : undefined} data-testid={`tab-${r}`} onClick={() => go(r)}>
              {r === 'story' ? 'Story' : r === 'memories' ? 'Memories' : r === 'photo' ? 'Photo' : 'Permissions'}
            </button>
          ))}
        </nav>
      </header>
      <ConnectionBanner />
      {view.room.demo && <p className="sample-ribbon" data-testid="sample-ribbon">Sample content · fictional stories, with photos and illustrations labeled at their source</p>}
      <main className="content">
        {route === 'story' && <Live session={session} view={view} headsetConnected={headsetConnected} onConsent={() => go('consent')} />}
        {route === 'memories' && view.me.role !== 'viewer' && <Memories session={session} onStory={() => go('story')} />}
        {route === 'photo' && <Photo session={session} view={view} onDone={() => go('story')} onConsent={() => go('consent')} />}
        {route === 'consent' && <Consent session={session} view={view} onDone={() => go(view.me.role === 'family' ? 'photo' : 'story')} />}
        {route === 'admin' && <Admin session={session} view={view} onBack={() => go('story')} onDeleted={() => onLeave('This memory was deleted: the photo, room, objects, lines, recordings and permissions.')} />}
        <footer className="foot">
          <p>Signed in as <strong>{view.me.displayName}</strong> ({view.me.role}).</p>
          <button type="button" className="btn btn-quiet" data-testid="leave-room" onClick={() => onLeave()}>Leave this room on this phone</button>
          <p className="muted small">Memory Gate supports reminiscence. It is not a medical treatment.</p>
        </footer>
      </main>
    </>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const saved = loadSession();
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get('room') ?? '').trim().toUpperCase().slice(0, 6);
    // An invitation to another room must not silently reopen a previous room. Preserve its stored credential until
    // the person chooses to join; a privileged link also lets an existing viewer explicitly rejoin as family.
    if (requested && (requested !== saved?.code || (params.has('key') && saved?.role === 'viewer'))) return null;
    return saved;
  });
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <ToastProvider>
      {session ? (
        <RoomShell key={session.token} session={session} onLeave={(n) => { saveSession(null); setSession(null); setNotice(n ?? null); window.location.hash = ''; }} />
      ) : (
        <Welcome notice={notice} onEnter={(s, first) => { saveSession(s); setNotice(null); window.location.hash = `/${first}`; setSession(s); }} />
      )}
    </ToastProvider>
  );
}
