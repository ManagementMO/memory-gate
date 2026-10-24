import { useState } from 'react';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../../convex/_generated/api';
import { FLAG_NAMES, type FlagName } from '../../../../packages/shared/src/flags';
import { spacedCode, timeOf } from '../format';
import { useLiveQuery, useRunner } from '../hooks';
import type { Session } from '../session';
import { Chip, Notice, useToast } from '../ui';

type RoomView = FunctionReturnType<typeof api.rooms.get>;

const FLAG_TEXT: Record<FlagName, string> = {
  'splat.live': 'Build rooms from photos on the GPU worker (else the sample room)',
  'objects.live': 'Make new object models live with Tripo (else library or placeholder)',
  'ai.live': 'Use Claude for the companion and objects (else the keyword mock)',
  'stt.live': 'Live speech to text with Cartesia',
  'tts.live': 'Companion voice with Cartesia',
  'worldlabs.backdrop': 'Wider World Labs backdrop',
  'worldlabs.generate': 'Allow photo world generation with World Labs (requires key, credits and photo-upload permission)',
  'splat.lite': 'Lighter room for when the headset drops frames',
};

export function Admin({ session, view, onBack, onDeleted }: { session: Session; view: RoomView; onBack: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const { code, token } = session;
  const jobs = useLiveQuery(api.splats.jobs, { code, token });
  const setFlag = useMutation(api.rooms.setFlag);
  const reset = useMutation(api.rooms.resetDemo);
  const open = useMutation(api.rooms.open);
  const del = useMutation(api.consents.deleteMemory);
  const recoverWorld = useMutation(api.worlddb.recover);
  const { busy, run } = useRunner(toast.report);
  const settings = useMutation(api.rooms.setSettings);
  const [confirmReset, setConfirmReset] = useState(false);
  const [typed, setTyped] = useState('');
  const [names, setNames] = useState(() => view.room.familyNames.join(', '));
  // Live-service switches are deployment-wide, so they need the operator code (ADMIN_CODE in practice/.env.worker),
  // not just room ownership. Kept for this tab only.
  const [adminCode, setAdminCode] = useState(() => { try { return sessionStorage.getItem('mg.adminCode') ?? ''; } catch { return ''; } });
  const rememberCode = (c: string) => { setAdminCode(c); try { sessionStorage.setItem('mg.adminCode', c); } catch { /* private mode */ } };

  if (!view.me.isOwner) {
    return (
      <section className="screen" data-testid="admin-screen">
        <Notice tone="info" title="Only the person who created the room can open these settings." />
        <button type="button" className="btn btn-wide" onClick={onBack}>Back to the story</button>
      </section>
    );
  }

  return (
    <section className="screen" data-testid="admin-screen" aria-labelledby="admin-h">
      <div className="section-head">
        <h2 id="admin-h">Room settings</h2>
        <button type="button" className="btn btn-quiet" onClick={onBack} data-testid="admin-back">Back to the story</button>
      </div>

      <div className="card">
        <h3>Headset</h3>
        <p className="muted">Fades the memory in on the headset now (and un-pauses).</p>
        <button type="button" className="btn btn-primary btn-wide" data-testid="open-headset" disabled={busy !== null}
          onClick={async () => { const r = await run('open', () => open({ code, token })); if (r.ok) toast.say('Sent to the headset.', 'ok'); }}>
          Open on headset
        </button>
        {view.room.openedAt && <p className="muted small">Last opened at {timeOf(view.room.openedAt)}</p>}
      </div>

      <div className="card">
        <h3>Family names</h3>
        <p className="muted">Names the speech-to-text should spell right, like a grandparent’s sister or a street. Separate them with commas.</p>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const familyNames = names.split(',').map((n) => n.trim()).filter(Boolean);
          const r = await run('names', () => settings({ code, token, familyNames }));
          if (r.ok) toast.say('Names saved.', 'ok');
        }}>
          <div className="input-row">
            <input data-testid="family-names" value={names} onChange={(e) => setNames(e.target.value)} placeholder="Wilhelmina, Elm Street" autoComplete="off" maxLength={400} />
            <button type="submit" className="btn btn-primary" disabled={busy !== null} data-testid="family-names-save">Save</button>
          </div>
        </form>
        {view.room.familyNames.length > 0 && <p className="muted small" data-testid="family-names-saved">Saved: {view.room.familyNames.join(', ')}</p>}
      </div>

      <div className="card" data-testid="flags-panel">
        <h3>Live services</h3>
        <p className="muted small">These switch providers for the whole deployment. Off means the fixture fallback runs.</p>
        <label className="field">
          <span>Operator code</span>
          <input data-testid="admin-code" type="password" inputMode="numeric" autoComplete="off" value={adminCode}
            onChange={(e) => rememberCode(e.target.value.trim())} placeholder="6 digits (from the team)" />
        </label>
        <ul className="flags">
          {FLAG_NAMES.map((name) => {
            const on = view.flags[name];
            return (
              <li key={name}>
                <button type="button" role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} data-testid={`flag-${name}`} disabled={busy !== null}
                  onClick={() => run(`flag-${name}`, () => setFlag({ code, token, name, value: !on, adminCode }))}>
                  <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
                  <span className="switch-text"><strong>{name}</strong><small>{FLAG_TEXT[name]}</small></span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card" data-testid="jobs-panel">
        <h3>Jobs and timing</h3>
        {jobs.problem ? <Notice tone="error">{jobs.problem.message}</Notice> : !jobs.data ? <p className="muted">Loading…</p> : jobs.data.length === 0 ? (
          <p className="muted" data-testid="jobs-empty">No jobs yet. Photo builds and new object models show up here.</p>
        ) : (
          <table className="jobs">
            <thead><tr><th scope="col">Job</th><th scope="col">Status</th><th scope="col">Time</th></tr></thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id} data-testid="job-row">
                  <td><strong>{j.kind}</strong><br /><span className="muted small">{j.provider} · {timeOf(j.createdAt)}{j.model ? ` · ${j.model}` : ''}</span>
                    {j.artifactHash && <details><summary className="small">Saved artifact</summary><span className="small" style={{ overflowWrap: 'anywhere' }}>SHA-256 {j.artifactHash}</span></details>}</td>
                  <td><Chip kind={`job-${j.status}`}>{j.status}</Chip>{j.attempts > 1 && <span className="muted small"> ×{j.attempts}</span>}
                    {j.lastError && <><br /><span className="muted small">{j.lastError.slice(0, 160)}</span></>}
                    {j.canRecover && <button type="button" className="btn btn-quiet" disabled={busy !== null}
                      onClick={() => run(`recover-${j.id}`, () => recoverWorld({ code, token, jobId: j.id }))}>Recover existing world · no new generation</button>}</td>
                  <td>{j.ms !== null ? `${(j.ms / 1000).toFixed(1)} s` : '…'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>People in this room</h3>
        <ul className="people">
          {view.members.map((m, i) => <li key={`${m.displayName}-${i}`}><strong>{m.displayName}</strong> <span className="muted">· {m.role}</span></li>)}
        </ul>
      </div>

      <div className="card">
        <h3>Reset demo room</h3>
        <p className="muted">Clears objects, the story and jobs, and un-pauses. Keeps the code, people, photo, room and permissions. Use it between visitors.</p>
        {confirmReset ? (
          <div className="row wrap">
            <button type="button" className="btn btn-danger" data-testid="reset-confirm" disabled={busy !== null}
              onClick={async () => { const r = await run('reset', () => reset({ code, token })); setConfirmReset(false); if (r.ok) toast.say('The demo room is fresh again.', 'ok'); }}>
              Yes, reset the room
            </button>
            <button type="button" className="btn" onClick={() => setConfirmReset(false)} data-testid="reset-cancel">Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn btn-wide" data-testid="reset-demo" onClick={() => setConfirmReset(true)}>Reset demo room</button>
        )}
      </div>

      <div className="card danger-zone">
        <h3>Delete this memory</h3>
        <p className="muted">Removes the photo, the room, every object, line and recording, and all permissions. This can’t be undone.</p>
        <label className="field">
          <span>Type the room code <strong>{spacedCode(code)}</strong> to confirm</span>
          <input data-testid="delete-code-input" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={7} />
        </label>
        <button type="button" className="btn btn-danger btn-wide" data-testid="delete-confirm" disabled={typed.replace(/\s+/g, '') !== code || busy !== null}
          onClick={async () => { const r = await run('delete', () => del({ code, token, confirmText: typed.replace(/\s+/g, '') })); if (r.ok) onDeleted(); }}>
          Delete this memory
        </button>
      </div>
    </section>
  );
}
