import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { fileUrl, headsetLink, joinLink } from '../backend';
import { capitalize, languageName, timeOf } from '../format';
import { copyText, useLiveQuery, useRunner } from '../hooks';
import { newCommandId } from '../ids';
import { SAMPLE } from '../sample';
import type { Session } from '../session';
import { Chip, Notice, Spinner, useToast } from '../ui';
import { Corrections } from './Corrections';
import { StoryRecorder } from './StoryRecorder';
import { MemoryStage } from './MemoryStage';
import { StoryPlace } from './StoryPlace';

type RoomView = FunctionReturnType<typeof api.rooms.get>;
type Obj = FunctionReturnType<typeof api.objects.list>[number];
type Utt = FunctionReturnType<typeof api.utterances.recent>[number];
type Ev = FunctionReturnType<typeof api.objects.events>[number];

const LIBRARY_HINTS = ['piano', 'armchair', 'radio', 'bowl of oranges', 'chair'];
const LABEL_OK = /^[a-z][a-z' -]{0,39}$/;

// ---------- replay (one clip at a time, on the phone's speaker) ----------
let playing: HTMLAudioElement | null = null;

function ReplayButton({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'ended' | 'error'>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    setState('idle');
    return () => { const prior=audio.current; prior?.pause(); if (playing === prior) playing=null; audio.current=null; };
  }, [url]);
  function toggle() {
    const src = fileUrl(url);
    if (!src) { setState('error'); return; }
    if (state === 'playing' && audio.current) { audio.current.pause(); setState('idle'); return; }
    if (playing && playing !== audio.current) playing.pause();
    const a = audio.current ?? new Audio();
    audio.current = a;
    if (a.src !== src) a.src = src;
    a.onplaying = () => setState('playing');
    a.onended = () => setState('ended');
    a.onpause = () => setState((s) => (s === 'playing' ? 'idle' : s));
    a.onerror = () => setState('error');
    a.currentTime = 0;
    setState('loading');
    playing = a;
    a.play().catch(() => setState('error'));
  }
  return (
    <button type="button" className="btn btn-quiet replay" onClick={toggle} data-testid="replay" data-state={state} data-src={fileUrl(url) ?? ''}
      aria-label={state === 'playing' ? `Stop the recording of ${label}` : `Replay the recording of ${label}`}>
      <span aria-hidden="true">{state === 'playing' ? '■' : '▶'}</span>
      {state === 'playing' ? 'Stop' : state === 'error' ? 'Can’t play' : 'Replay'}
    </button>
  );
}

// ---------- objects ----------
function modelChip(o: Obj): { kind: string; text: string } {
  if (o.model === 'generating') return { kind: 'imagining', text: 'Imagining…' };
  if (o.modelSource === 'library') return { kind: 'library', text: 'Library model' };
  if (o.modelSource === 'tripo' || o.modelSource === 'retexture') return { kind: 'live', text: 'Made live' };
  return { kind: 'placeholder', text: o.model === 'failed' ? 'Placeholder' : 'Placeholder · imagining…' };
}

function ObjectCard({ o, canAct, busy, onConfirm, onReject }: { o: Obj; canAct: boolean; busy: boolean; onConfirm: () => void; onReject: () => void }) {
  const ghost = o.status === 'ghost';
  const m = modelChip(o);
  const said = o.source;
  const showQuote = !!said && !!o.quote;
  return (
    <li className={`object object-${o.status}`} data-testid="object-item" data-label={o.label} data-status={o.status}>
      <div className="chips">
        <Chip kind={ghost ? 'ghost' : 'confirmed'} testId="object-status">{ghost ? 'Suggested' : 'In the room'}</Chip>
        <Chip kind={`model chip-${m.kind}`} testId="object-model">{m.text}</Chip>
      </div>
      <h3 className="object-label">{capitalize(o.label)}{o.details.length > 0 && <span className="details"> · {o.details.join(', ')}</span>}</h3>
      {o.where && <p className="where">{o.where}</p>}
      {o.anchor.source === 'suggested-layout' && <p className="muted small">{ghost ? 'Initial floor suggestion. Review its placement; the words above describe the story.' : 'Placement reviewed by the family; scenery remains an interpretation.'}</p>}
      {showQuote && <blockquote className="quote" lang={said?.language ?? undefined} data-testid="object-quote">“{o.quote}”</blockquote>}
      {said?.translation && <p className="translation" data-testid="object-translation"><span>In English</span> “{said.translation}”</p>}
      <p className="attribution" data-testid="object-attribution">
        {said ? `said by ${said.speaker} · ${timeOf(said.at)}` : `added by ${o.proposedBy} on the phone · ${timeOf(o.createdAt)}`}
      </p>
      {o.confirmedBy && <p className="muted small" data-testid="object-confirmed-by">Confirmed by {o.confirmedBy}{o.confirmedAt ? ` · ${timeOf(o.confirmedAt)}` : ''}</p>}
      {o.hasStoredGlb && <p className="muted small">A newer model arrived after it was confirmed; it is kept, not swapped in.</p>}
      {o.correctionSource && <div className="placement-source">
        <p className="muted small">Placement remembered by {o.correctionSource.speaker ?? o.correctionSource.actor}</p>
        <p>{o.correctionSource.description}</p>
        {o.correctionSource.transcript && <blockquote className="quote">“{o.correctionSource.transcript}”</blockquote>}
        {o.correctionSource.translation && <p className="translation"><span>In English</span> {o.correctionSource.translation}</p>}
        {o.correctionSource.audioUrl && <ReplayButton url={o.correctionSource.audioUrl} label="the original placement correction" />}
      </div>}
      {(ghost && canAct) || said?.audioUrl ? (
        <div className="row wrap actions">
          {ghost && canAct && (
            <>
              <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy} data-testid="object-confirm">Confirm</button>
              <button type="button" className="btn" onClick={onReject} disabled={busy} data-testid="object-reject">Not quite</button>
            </>
          )}
          {said?.audioUrl && <ReplayButton url={said.audioUrl} label={`${said.speaker} about the ${o.label}`} />}
        </div>
      ) : null}
    </li>
  );
}

// ---------- timeline ----------
const INTENT_TEXT: Record<string, string> = {
  propose_object: 'Suggested an object', confirm_pending: 'Confirmed', reject_pending: 'Not quite', undo_last: 'Undo', pause_session: 'Paused', none: 'Just talking',
  correct_object: 'Suggested a placement',
};

function UtteranceItem({ u }: { u: Utt }) {
  const lang = u.language && u.language !== 'en' ? languageName(u.language) : null;
  const mock = u.status === 'done' && u.aiMode !== 'live' && u.aiMode !== 'guided-spatial';
  return (
    <li className={`utt utt-${u.status}`} data-testid="utterance-item" data-status={u.status} data-intent={u.intent ?? ''}>
      <p className="who">
        <strong>{u.speaker}</strong> <span className="muted">· {timeOf(u.createdAt)}</span>
        {u.source === 'typed' && <Chip kind="soft">typed</Chip>}
        {lang && <Chip kind="soft">{lang}</Chip>}
      </p>
      <blockquote className="quote" lang={u.language ?? undefined} data-testid="utterance-text">“{u.transcript}”</blockquote>
      {u.translation && <p className="translation" data-testid="utterance-translation"><span>In English</span> “{u.translation}”</p>}
      {u.status === 'pending' && <p className="muted small pending"><Spinner label="Working" /> Listening for objects…</p>}
      {u.status === 'failed' && <p className="muted small">This line couldn’t be worked out. It is kept as text.</p>}
      {u.status === 'done' && (
        <>
          <div className="chips">
            {u.intent && <Chip kind="intent" testId="utterance-intent">{INTENT_TEXT[u.intent] ?? u.intent}</Chip>}
            {mock && <Chip kind="mock" testId="utterance-mock">{u.aiMode === 'mock-fallback' ? 'mock (AI unavailable)' : 'mock'}</Chip>}
            {u.aiMode === 'guided-spatial' && <Chip kind="soft">Guided spatial command</Chip>}
          </div>
          {u.sayBack && <p className="sayback" data-testid="utterance-sayback"><span>Said back</span> “{u.sayBack}”</p>}
          {u.reply && <p className="reply" data-testid="utterance-reply"><span>Companion</span> “{u.reply}”</p>}
          {u.reply && u.replyTranslation && <p className="translation" data-testid="utterance-reply-translation"><span>In English</span> “{u.replyTranslation}”</p>}
        </>
      )}
      {u.audioUrl && <div className="row"><ReplayButton url={u.audioUrl} label={`${u.speaker}’s line`} /></div>}
    </li>
  );
}

// ---------- headset ----------
export function HeadsetCard({ code, connected, joinKey }: { code: string; connected: boolean; joinKey: string | null }) {
  const toast = useToast();
  const link = headsetLink(code, joinKey);
  return (
    <div className={`card compact headset-card ${connected ? 'is-connected' : ''}`} data-testid="headset-card">
      <h2 className="h3">{connected ? 'The headset is in the room' : 'Open on the Quest'}</h2>
      <p className="url" data-testid="headset-url" aria-label="Headset link">{link.url}</p>
      <p className="muted small" data-testid="headset-url-dev">If the production build isn't running (scripts/start-all.sh starts it), use the dev server: <span className="url-inline">{link.devUrl}</span></p>
      <div className="row">
        <button type="button" className="btn btn-quiet" onClick={async () => toast.say((await copyText(link.url)) ? 'Headset link copied.' : link.url, 'ok')}>Copy link</button>
        <button type="button" className="btn btn-quiet" onClick={async () => toast.say((await copyText(joinLink(code, joinKey))) ? 'Family join link copied.' : joinLink(code, joinKey), 'ok')}>Family link</button>
      </div>
      {joinKey && <p className="muted small" data-testid="family-key">Family key <strong>{joinKey}</strong>: share it only with family. With just the room code, people can watch but not change anything.</p>}
      {!link.onLan && (
        <p className="muted small note" data-testid="headset-note">
          This is the <code>adb reverse</code> link (run <code>adb reverse tcp:4173 tcp:4173</code>). Open this page from the computer’s Wi-Fi address to get a Wi-Fi link.
        </p>
      )}
    </div>
  );
}

// ---------- the screen ----------
export function Live({ session, view, headsetConnected, onConsent }: { session: Session; view: RoomView; headsetConnected: boolean; onConsent: () => void }) {
  const toast = useToast();
  const { code, token } = session;
  const objects = useLiveQuery(api.objects.list, { code, token });
  const events = useLiveQuery(api.objects.events, { code, token });
  const recent = useLiveQuery(api.utterances.recent, { code, token, limit: 30 });
  const library = useLiveQuery(api.library.list, { code, token });
  const hints = library.data?.length ? library.data.map((l) => l.key) : LIBRARY_HINTS;
  const setPaused = useMutation(api.rooms.setPaused);
  const confirm = useMutation(api.objects.confirm);
  const reject = useMutation(api.objects.reject);
  const undo = useMutation(api.objects.undo);
  const propose = useMutation(api.objects.proposeFromPhone);
  const practice = useMutation(api.objects.practiceCourtyard);
  const say = useMutation(api.utterances.add);
  const { busy, run } = useRunner(toast.report);
  const [stale, setStale] = useState(false);
  const [label, setLabel] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [line, setLine] = useState('');
  const lineInput = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(session.role === 'storyteller');

  const role = view.me.role;
  const canAct = role === 'family' || role === 'storyteller';
  const isFamily = role === 'family';
  const scopes = new Set(view.consents.flatMap((c) => c.scopes));
  const paused = view.room.paused;

  const undoable: Ev | undefined = useMemo(
    () => events.data?.find((e) => ['propose', 'confirm', 'reject', 'correction'].includes(e.kind) && !e.undone),
    [events.data],
  );
  useEffect(() => {
    if (!stale) return;
    const id = window.setTimeout(() => setStale(false), 10_000);
    return () => window.clearTimeout(id);
  }, [stale]);

  const sorted = useMemo(() => {
    const list = [...(objects.data ?? [])];
    return list.sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'ghost' ? -1 : 1));
  }, [objects.data]);

  async function onPause() {
    const next = !paused;
    const r = await run('pause', () => setPaused({ code, token, paused: next, commandId: newCommandId() }));
    if (r.ok) toast.say(next ? 'Paused. The memory fades and the headset shows a break instruction.' : 'Resumed. The memory fades back in.', 'ok');
  }

  async function onUndo() {
    if (!undoable) return;
    setStale(false);
    const r = await run('undo', () => undo({ code, token, commandId: newCommandId(), expectedEventId: undoable.id as Id<'events'> }));
    if (!r.ok && r.problem.code === 'STALE') setStale(true);
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const clean = label.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!clean) { setLabelError('Type the name of something that was in the room.'); return; }
    if (!LABEL_OK.test(clean)) { setLabelError('Use plain words for the name, like “piano” or “radio”.'); return; }
    setLabelError(null);
    const r = await run('add', () => propose({ code, token, label: clean, commandId: newCommandId() }));
    if (r.ok) { setLabel(''); toast.say(`Suggested “${clean}”. Confirm it when it looks right.`, 'ok'); }
  }

  async function onTell(e: FormEvent) {
    e.preventDefault();
    const text = line.trim();
    if (!text) return;
    const r = await run('tell', () => say({ code, token, transcript: text, source: 'typed', commandId: newCommandId() }));
    if (r.ok) setLine('');
  }

  const undoText = undoable
    ? undoable.kind === 'propose' ? `Undo the suggestion “${undoable.label ?? 'object'}”`
      : undoable.kind === 'correction' ? `Undo moving “${undoable.label ?? 'object'}”`
      : undoable.kind === 'confirm' ? `Undo confirming “${undoable.label ?? 'object'}”`
        : `Undo “not quite” on “${undoable.label ?? 'object'}”`
    : 'Nothing to undo';

  return (
    <section className={`screen live-story ${focused ? 'story-focused' : ''}`} data-testid="live-screen" aria-label="Live story" data-focused={focused}>
      <div className="story-heading">
        <div><p className="eyebrow">Time together</p><h2>Every story starts with you.</h2></div>
        {canAct && <button className="btn btn-quiet focus-toggle" aria-pressed={focused} data-testid="story-focus" onClick={() => setFocused(v => !v)}>
          {focused ? 'Show family tools' : 'Simpler storyteller view'}
        </button>}
      </div>
      {paused && (
        <Notice tone="warn" title="Paused" testId="paused-banner">
          The memory fades and the headset shows a quiet break instruction. No new questions are asked. Resume when everyone is ready.
        </Notice>
      )}
      {canAct ? (
        <button type="button" className={`btn btn-pause ${paused ? 'is-paused' : ''}`} onClick={onPause} disabled={busy === 'pause'} data-testid="pause-toggle" data-paused={paused ? 'yes' : 'no'}>
          <span aria-hidden="true" className="pause-icon">{paused ? '▶' : '❚❚'}</span>
          {paused ? 'Resume the memory' : 'Pause the session'}
        </button>
      ) : (
        <p className="muted small">You are watching. Family members can confirm, add and pause.</p>
      )}

      {canAct && (
        <StoryRecorder session={session} allowed={scopes.has('voice_processing')} recordingAllowed={scopes.has('voice_recording')}
          paused={paused} onConsent={onConsent} />
      )}

      <MemoryStage code={code} title={view.room.title} illustrative={!view.splat?.url || view.splat.status !== 'ready'}
        fromStory={!!view.splat?.sourceStory}
        sharing={scopes.has('share_with_family')} paused={paused} onConsent={onConsent} />
      <div className="family-tools">
        <details className="card compact">
          <summary>{headsetConnected ? 'Headset connected · invite family' : 'Connect a headset or invite family'}</summary>
          <HeadsetCard code={code} connected={headsetConnected} joinKey={view.joinKey} />
        </details>
      </div>

      <section className="story-moment" aria-label="Latest words" data-testid="story-moment" aria-live="polite">
        <p className="eyebrow">{recent.data?.[0] ? `${recent.data[0].speaker}’s words` : 'At your own pace'}</p>
        <blockquote>{recent.data?.[0] ? `“${recent.data[0].transcript}”` : 'A place you love. A small detail. Anything you feel like sharing.'}</blockquote>
        {recent.data?.[0]?.translation && <p className="translation">{recent.data[0].translation}</p>}
        {recent.data?.[0]?.audioUrl && <ReplayButton key={recent.data[0].id} url={recent.data[0].audioUrl} label="the latest original words" />}
        {recent.data?.[0]?.dropped.some(note => note.startsWith('No clear floor space')) && <p className="muted small" role="status">Your words are saved. There is no clear floor space for another visual suggestion; you can keep talking or arrange the existing objects.</p>}
        <p className="muted small">{recent.data?.[0]?.status === 'pending' ? 'Keeping your words. Any visual suggestion will appear for review.' : 'There is no right answer. You can change the scene, keep talking, or simply enjoy being here.'}</p>
      </section>

      <div className="family-tools" data-testid="family-story-tools">

      {isFamily && <StoryPlace session={session} view={view} latest={recent.data?.[0]} onConsent={onConsent} />}

      {objects.data && objects.data.length > 0 && <Corrections code={code} token={token} revision={view.room.revision}
        objects={objects.data} canAct={canAct} paused={paused} />}

      <div className="section-head">
        <h2>In the room</h2>
        {canAct && (
          <button type="button" className="btn btn-quiet" onClick={onUndo} disabled={!undoable || busy === 'undo'} data-testid="undo-button" data-target={undoable?.id ?? ''}>
            <span aria-hidden="true">↶</span> {undoText}
          </button>
        )}
      </div>
      {stale && <Notice tone="warn" testId="undo-stale">The room changed just now. Check the list, then undo again if you still want to.</Notice>}

      {objects.problem ? (
        <Notice tone="error" testId="objects-error">{objects.problem.message}</Notice>
      ) : !objects.data ? (
        <p className="muted"><Spinner label="Loading" /> Loading the room…</p>
      ) : sorted.length === 0 ? (
        <p className="empty" data-testid="objects-empty">Nothing in the room yet; when someone names an object it appears here as a suggestion.</p>
      ) : (
        <ul className="objects" data-testid="object-list">
          {sorted.map((o) => (
            <ObjectCard key={o.id} o={o} canAct={canAct} busy={busy !== null}
              onConfirm={() => run(`confirm-${o.id}`, () => confirm({ code, token, objectId: o.id, commandId: newCommandId() }))}
              onReject={() => run(`reject-${o.id}`, () => reject({ code, token, objectId: o.id, commandId: newCommandId() }))} />
          ))}
        </ul>
      )}

      {view.room.demo && isFamily && objects.data?.length === 0 && <div className="card compact" data-testid="practice-starter">
        <h3>An illustrative place to practice</h3>
        <p className="muted small">Load a bench, tree, gate and keepsake frame, then try “Move the bench beside the tree, facing the gate.” These are original sample props, independent of the photo.</p>
        <button type="button" className="btn btn-primary" data-testid="practice-load" disabled={!!busy || paused}
          onClick={() => run('practice', () => practice({ code, token, commandId: newCommandId() }))}>Load four illustrative props</button>
      </div>}

      {isFamily && (
        <form className="card compact" onSubmit={onAdd} noValidate>
          <label className="field">
            <span>Add an object</span>
            <div className="input-row">
              <input data-testid="add-object-input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="e.g. radio" autoComplete="off" autoCapitalize="none" />
              <button type="submit" className="btn btn-primary" disabled={busy === 'add'} data-testid="add-object-submit">{busy === 'add' ? 'Adding…' : 'Add'}</button>
            </div>
          </label>
          <div className="chips hints" aria-label="Objects with ready models">
            {hints.map((h) => <button key={h} type="button" className="chip chip-hint" onClick={() => setLabel(h)}>{h}</button>)}
          </div>
          {labelError && <Notice tone="error" testId="add-object-error">{labelError}</Notice>}
          <p className="muted small">It appears as a suggestion first. Someone still has to confirm it.</p>
        </form>
      )}

      </div>
      {canAct && (
        <form className="card compact" onSubmit={onTell} noValidate>
          <label className="field">
            <span>Tell the room (keyboard)</span>
            <div className="input-row">
              <input ref={lineInput} data-testid="tell-input" value={line} onChange={(e) => setLine(e.target.value)} maxLength={600} placeholder="Tell the room…"
                disabled={!scopes.has('voice_processing')} autoComplete="off" />
              <button type="submit" className="btn btn-primary" disabled={busy === 'tell' || !scopes.has('voice_processing')} data-testid="tell-submit">{busy === 'tell' ? 'Sending…' : 'Send'}</button>
            </div>
          </label>
          {!scopes.has('voice_processing') ? (
            <Notice tone="warn" testId="tell-needs-consent">
              Typed lines go to the companion, so they need the “Talk with the companion” permission.
              <div className="row"><button type="button" className="btn" onClick={onConsent}>Open Permissions</button></div>
            </Notice>
          ) : (
            <div className="chips hints" aria-label="Sample lines (fictional)">
              <span className="muted small">Sample lines (fictional):</span>
              {SAMPLE.lines.map((s) => <button key={s} type="button" className="chip chip-hint" onClick={() => { setLine(s); lineInput.current?.focus(); }}>{s}</button>)}
            </div>
          )}
        </form>
      )}

      <div className="family-tools">
      <h2>The story so far</h2>
      {recent.problem ? (
        <Notice tone="error">{recent.problem.message}</Notice>
      ) : !recent.data ? (
        <p className="muted"><Spinner label="Loading" /> Loading the story…</p>
      ) : recent.data.length === 0 ? (
        <p className="empty" data-testid="timeline-empty">No one has spoken yet. Speak on the phone or headset; each line appears here with a translation if needed.</p>
      ) : (
        <ol className="timeline" data-testid="timeline">
          {recent.data.map((u) => <UtteranceItem key={u.id} u={u} />)}
        </ol>
      )}
      </div>
    </section>
  );
}
