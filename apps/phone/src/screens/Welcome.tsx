import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { problemOf } from '../errors';
import { SAMPLE } from '../sample';
import type { Role, Session } from '../session';
import { Notice } from '../ui';

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'family', label: 'Family', hint: 'Confirm objects, add things, pause' },
  { value: 'storyteller', label: 'Storyteller', hint: 'The person remembering' },
  { value: 'viewer', label: 'Just watching', hint: 'See the story, change nothing' },
];

export function Welcome({ onEnter, notice }: { onEnter: (s: Session, firstScreen: 'consent' | 'story') => void; notice?: string | null }) {
  const create = useMutation(api.rooms.create);
  const join = useMutation(api.rooms.join);
  const initialCode = (new URLSearchParams(window.location.search).get('room') ?? '').toUpperCase().slice(0, 6);
  const initialKey = (new URLSearchParams(window.location.search).get('key') ?? '').toUpperCase().slice(0, 12);

  const [title, setTitle] = useState('');
  const [createName, setCreateName] = useState('');
  const [useSample, setUseSample] = useState(false);
  const [code, setCode] = useState(initialCode);
  const [joinName, setJoinName] = useState('');
  const [role, setRole] = useState<Role>(initialCode && !initialKey ? 'viewer' : 'family');
  const [key, setKey] = useState(initialKey);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const name = createName.trim();
    if (!name) { setCreateError('Add your name so the family knows who made the room.'); return; }
    setBusy('create');
    try {
      const roomTitle = title.trim() || (useSample ? SAMPLE.roomTitle : 'Our room');
      const r = await create({ title: roomTitle, displayName: name, demo: useSample, offline: new URLSearchParams(window.location.search).get('mode') === 'offline' });
      onEnter({ code: r.code, token: r.token, name, role: 'family', sample: useSample }, 'consent');
    } catch (err) {
      setCreateError(problemOf(err).message);
    } finally {
      setBusy(null);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    setJoinError(null);
    const c = code.replace(/\s+/g, '').toUpperCase();
    const name = joinName.trim();
    if (c.length !== 6) { setJoinError('The room code has six letters and numbers.'); return; }
    if (!name) { setJoinError('Add your name so the family knows who joined.'); return; }
    setBusy('join');
    try {
      const r = await join({ code: c, displayName: name, role, ...(role !== 'viewer' && key.trim() ? { key: key.trim() } : {}) });
      onEnter({ code: r.code, token: r.token, name, role }, 'story');
    } catch (err) {
      setJoinError(problemOf(err).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="welcome" data-testid="welcome">
      <header className="welcome-head">
        <p className="eyebrow">Memory Gate</p>
        <h1>A place to remember, together.</h1>
        <p className="lede">
          Tell a story in your own words. Follow it on a headset, shape the place together, and keep the original voice behind each memory.
          Suggested additions and placements need your confirmation. It supports reminiscence; it is not a treatment.
        </p>
      </header>

      {notice && <Notice tone="ok" testId="welcome-notice">{notice}</Notice>}

      <section className="card" aria-labelledby="create-h">
        <h2 id="create-h">Create a room</h2>
        <form onSubmit={onCreate} noValidate>
          <label className="field">
            <span>Room title</span>
            <input data-testid="create-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60}
              placeholder={useSample ? SAMPLE.roomTitle : 'Grandma’s front room'} autoComplete="off" />
          </label>
          <label className="field">
            <span>Your name</span>
            <input data-testid="create-name" value={createName} onChange={(e) => setCreateName(e.target.value)} maxLength={40}
              placeholder="e.g. Karen" autoComplete="given-name" required />
          </label>
          <label className="check">
            <input type="checkbox" data-testid="create-sample" checked={useSample} onChange={(e) => setUseSample(e.target.checked)} />
            <span>
              <strong>Use the sample content</strong>
              <small>A public-domain 1938 photo from the Library of Congress and an optional illustrative courtyard starter. Both are clearly labeled samples.</small>
            </span>
          </label>
          {createError && <Notice tone="error" testId="create-error">{createError}</Notice>}
          <button type="submit" className="btn btn-primary btn-wide" data-testid="create-submit" disabled={busy !== null}>
            {busy === 'create' ? 'Creating…' : 'Create a room'}
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="join-h">
        <h2 id="join-h">Join with a code</h2>
        <form onSubmit={onJoin} noValidate>
          <label className="field">
            <span>Room code</span>
            <input data-testid="join-code" className="code-input" value={code} maxLength={7} inputMode="text" autoCapitalize="characters"
              autoComplete="off" spellCheck={false} placeholder="ABC234" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
          <label className="field">
            <span>Your name</span>
            <input data-testid="join-name" value={joinName} onChange={(e) => setJoinName(e.target.value)} maxLength={40}
              placeholder="e.g. Sam" autoComplete="given-name" />
          </label>
          <fieldset className="roles">
            <legend>I am…</legend>
            {ROLES.map((r) => (
              <label key={r.value} className={`role ${role === r.value ? 'role-on' : ''}`}>
                <input type="radio" name="role" value={r.value} data-testid={`join-role-${r.value}`} checked={role === r.value} onChange={() => setRole(r.value)} />
                <span><strong>{r.label}</strong><small>{r.hint}</small></span>
              </label>
            ))}
          </fieldset>
          {role !== 'viewer' && (
            <label className="field">
              <span>Family key</span>
              <input data-testid="join-key" className="code-input" value={key} maxLength={12} autoCapitalize="characters" autoComplete="off"
                spellCheck={false} placeholder="from the family link" onChange={(e) => setKey(e.target.value.toUpperCase())} />
            </label>
          )}
          {joinError && <Notice tone="error" testId="join-error">{joinError}</Notice>}
          <button type="submit" className="btn btn-primary btn-wide" data-testid="join-submit" disabled={busy !== null}>
            {busy === 'join' ? 'Joining…' : 'Join the room'}
          </button>
        </form>
      </section>

      <p className="fineprint">Sample content in this build is labeled as such. Lines and names in the sample are fictional.</p>
    </main>
  );
}
