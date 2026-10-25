// Perspectives on a phone or laptop: whose eyes you see through (and your name), your view or the overview, adding a
// memory by typing or speaking, memories handed to you, the story behind a ghost, old photographs of the place, and
// the likeness others see. The headset has the same things on its wrist (xr/OriginRig.tsx).
import { useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../../../convex/_generated/api';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { convex, uploadFile } from '../../backend/client';
import { TouchPad } from '../../red-kite/TouchPad';
import { recognitionLang, useGate } from '../../state/store';
import { CloseIcon } from '../../ui/Icons';
import { pinArchive, searchArchive, type ArchiveResult } from '../archive';
import { story } from '../attribution';
import { handOver, otherPerspective, respondHandoff } from '../handoffs';
import { socialLink } from '../link';
import { overlayActive } from '../overlay';
import { claimPerspective, inMemory } from '../perspectives';
import { notify, perspectiveById, useSocial, viewingPerspective, type PerspectiveKey } from '../store';
import { walkPad } from '../walk';
import './social.css';

const AVATAR_KEY = 'mg.gate.avatar';
/** The visit whose perspectives were last set up fresh (see SocialUI). */
let freshFor: string | null = null;
const readKey = () => { try { return localStorage.getItem(AVATAR_KEY); } catch { return null; } };
const writeKey = (k: string | null) => { try { if (k) localStorage.setItem(AVATAR_KEY, k); else localStorage.removeItem(AVATAR_KEY); } catch { /* private mode */ } };

function Sheet({ title, onClose, children, testId }: { title: string; onClose: () => void; children: React.ReactNode; testId: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet glass social-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} data-testid={testId}>
        <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function PerspectivePicker({ onClose }: { onClose: () => void }) {
  const perspectives = useSocial((s) => s.perspectives);
  const memberId = useSocial((s) => s.memberId);
  const members = useSocial((s) => s.members);
  const role = useGate((s) => s.session?.role);
  const mine = members.find((m) => m.id === memberId)?.name;
  const [name, setName] = useState(mine && mine !== 'You' && mine !== 'Family' ? mine : '');
  // The eyes nobody has claimed yet (the other person in the room may already be seeing through the other pair).
  const free = perspectives.filter((p) => !p.claimedBy || p.claimedBy === memberId).map((p) => p.key);
  const usual: PerspectiveKey = role === 'guest' ? 'child' : 'grandparent';
  const suggested: PerspectiveKey = free.includes(usual) || !free.length ? usual : free[0]!;
  const [guardian, setGuardian] = useState(false);
  const pick = (key: PerspectiveKey) => {
    void claimPerspective(key, name || null);
    // The grandchild's voice is kept as words only, unless a parent or guardian agrees to keep the clips too.
    if (key === 'child' && useGate.getState().session) setGuardian(true); else onClose();
  };
  if (guardian) return <ChildVoice name={name} onClose={onClose} />;
  return (
    <Sheet title="Whose eyes will you see through?" onClose={() => { useSocial.getState().set({ chosen: true }); onClose(); }} testId="perspective-picker">
      <p>Everyone sees the memory from their own height. What you say stays with the eyes you see through.</p>
      <label className="social-field">
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="So the others know it’s you" data-testid="social-name" />
      </label>
      <div className="perspective-choices">
        {perspectives.map((p) => {
          const taken = p.claimedBy && p.claimedBy !== memberId;
          return (
            <button key={p.key} type="button" className={`perspective-choice ${p.key === suggested ? 'suggested' : ''}`} style={{ '--p': p.color } as React.CSSProperties} onClick={() => pick(p.key)} data-testid={`choose-${p.key}`}>
              <span className="dot" aria-hidden="true" />
              <strong>{p.label}</strong>
              <small>{taken ? `${p.claimedName} sees through these eyes` : `Eye height ${p.eyeHeight.toFixed(1)} m`}</small>
            </button>
          );
        })}
      </div>
      <button type="button" className="quiet-link" onClick={() => { useSocial.getState().set({ chosen: true }); onClose(); }}>Just look for now</button>
    </Sheet>
  );
}

/** Choosing the grandchild's eyes: may their voice be kept (for replaying in the album), or only their words? */
function ChildVoice({ name, onClose }: { name: string; onClose: () => void }) {
  const session = useGate((s) => s.session);
  const status = useQuery(api.voiceGuard.status, session ? { code: session.code, token: session.token } : 'skip');
  const [guardianName, setGuardianName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const who = name.trim() || 'the grandchild';
  const keep = async () => {
    if (!session) return;
    setBusy(true); setError('');
    try { await convex.mutation(api.voiceGuard.agree, { code: session.code, token: session.token, guardianName }); onClose(); }
    catch (e) { setError((e as { data?: { message?: string } }).data?.message ?? 'That couldn’t be saved. Please try again.'); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await convex.mutation(api.voiceGuard.revoke, { code: session.code, token: session.token });
      await socialLink.request({ type: 'clear-my-clips' }).catch(() => undefined);
      notify('Only the words are kept now.');
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={`Keep ${who}’s voice?`} onClose={onClose} testId="child-voice">
      <p>Everything {who} says is kept as words, for the family’s album. The recordings of their voice are kept too only if a parent or guardian agrees.</p>
      {status?.agreed ? (
        <>
          <p className="muted">{status.guardianName ? `${status.guardianName} agreed to keep their voice.` : 'A guardian agreed to keep their voice.'}</p>
          <div className="social-actions">
            <button type="button" className="pill glass" onClick={() => void stop()} disabled={busy} data-testid="child-voice-stop">Keep words only, delete the recordings</button>
            <button type="button" className="pill glass" onClick={onClose} data-testid="child-voice-done">Done</button>
          </div>
        </>
      ) : (
        <>
          <label className="social-field"><span>Parent or guardian’s name</span><input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} maxLength={80} data-testid="child-voice-guardian" /></label>
          <label className="social-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="child-voice-agree" /> I am their parent or guardian, and I agree to recordings of their voice being kept for the family’s album in these visits.</label>
          {error && <p className="social-error" role="alert">{error}</p>}
          <div className="social-actions">
            <button type="button" className="pill glass" onClick={() => void keep()} disabled={busy || !agree || !guardianName.trim()} data-testid="child-voice-keep">Keep their voice too</button>
            <button type="button" className="pill glass" onClick={onClose} data-testid="child-voice-words">Words only</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Composer({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [hearing, setHearing] = useState(false);
  const rec = useRef<{ stop: () => void } | null>(null);
  const p = viewingPerspective();
  const Speech = (window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike }).webkitSpeechRecognition;
  const hold = () => {
    if (!Speech || rec.current) return;
    const r = new Speech();
    r.interimResults = false; r.continuous = true; r.lang = recognitionLang();
    r.onresult = (e) => { const said = Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim(); if (said) setText((t) => (t ? `${t} ${said}` : said)); };
    r.onend = () => { rec.current = null; setHearing(false); };
    try { r.start(); rec.current = r; setHearing(true); } catch { setHearing(false); }
  };
  const release = () => rec.current?.stop();
  const keep = async () => {
    const words = text.trim();
    if (!words) return;
    setBusy(true);
    const id = await story(words, { kind: 'note', addsThings: overlayActive() });
    setBusy(false);
    if (id) { notify(`Kept with the ${p.label.toLowerCase()}’s eyes`); onClose(); }
  };
  return (
    <Sheet title="Add what you remember" onClose={onClose} testId="story-composer">
      <p>Through the {p.label.toLowerCase()}’s eyes. Things you mention appear in the place for you, and softly for the others.</p>
      <textarea className="social-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} placeholder="There was a little stool by the stove…" data-testid="story-text" />
      <div className="social-actions">
        {Speech && (
          <button type="button" className={`pill glass ${hearing ? 'on' : ''}`} onPointerDown={hold} onPointerUp={release} onPointerLeave={release} data-testid="story-speak">
            {hearing ? 'Listening…' : 'Hold to speak'}
          </button>
        )}
        <button type="button" className="pill glass" disabled={busy || !text.trim()} onClick={() => void keep()} data-testid="story-keep">{busy ? 'Keeping…' : 'Keep it'}</button>
      </div>
    </Sheet>
  );
}
type SpeechLike = { interimResults: boolean; continuous: boolean; lang: string; start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void };

function StoryCard() {
  const openStory = useSocial((s) => s.openStory);
  const story = useSocial((s) => s.stories.find((x) => x.id === s.openStory));
  const viewing = useSocial((s) => s.viewing);
  const xr = useGate((s) => s.xr);
  if (!openStory || !story || xr) return null;
  const p = perspectiveById(story.perspectiveId);
  const from = story.handedFrom ? perspectiveById(story.handedFrom) : null;
  const other = otherPerspective();
  const mine = p?.key === viewing;
  const close = () => useSocial.getState().set({ openStory: null });
  return (
    <aside className="story-card glass" style={{ '--p': p?.color ?? '#cdb4ff' } as React.CSSProperties} data-testid="story-card">
      <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={close}><CloseIcon /></button>
      <p className="who"><span className="dot" aria-hidden="true" />{story.speakerName}, through the {(p?.label ?? 'other').toLowerCase()}’s eyes{from ? `, handed from the ${from.label.toLowerCase()}` : ''}</p>
      <blockquote>“{story.text}”</blockquote>
      {mine && other && socialLink.live && (
        <button type="button" className="pill glass" onClick={() => { void handOver(story.id, other.id); close(); }} data-testid="story-hand">Hand it to the {other.label.toLowerCase()}</button>
      )}
    </aside>
  );
}

function Handoffs() {
  const handoffs = useSocial((s) => s.handoffs);
  const stories = useSocial((s) => s.stories);
  const viewing = useSocial((s) => s.viewing);
  const perspectives = useSocial((s) => s.perspectives);
  const xr = useGate((s) => s.xr);
  const mine = perspectives.find((p) => p.key === viewing);
  const incoming = handoffs.filter((h) => h.status === 'pending' && h.toPerspectiveId === mine?.id);
  if (xr || !incoming.length) return null;
  return (
    <div className="handoffs" data-testid="handoffs">
      {incoming.slice(0, 3).map((h) => {
        const s = stories.find((x) => x.id === h.storyId);
        return (
          <article key={h.id} className="handoff glass" style={{ '--p': perspectiveById(h.fromPerspectiveId)?.color ?? '#cdb4ff' } as React.CSSProperties}>
            <p><strong>{h.senderName}</strong> handed you a memory from the {(perspectiveById(h.fromPerspectiveId)?.label ?? 'other').toLowerCase()}’s eyes</p>
            {s && <blockquote>“{s.text.slice(0, 160)}{s.text.length > 160 ? '…' : ''}”</blockquote>}
            <div className="social-actions">
              <button type="button" className="pill glass" onClick={() => void respondHandoff(h, true)} data-testid="handoff-keep">Keep it</button>
              <button type="button" className="quiet-link" onClick={() => void respondHandoff(h, false)}>Not now</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ArchiveSheet({ onClose }: { onClose: () => void }) {
  const p = viewingPerspective();
  const session = useGate((s) => s.session);
  const title = useGate((s) => s.memoryTitle);
  const pins = useSocial((s) => s.pins);
  const [place, setPlace] = useState(p.archivePlace || '');
  const [yearFrom, setFrom] = useState(p.yearFrom || 1900);
  const [yearTo, setTo] = useState(p.yearTo || 1980);
  const [terms, setTerms] = useState(title ? title.replace(/^the /i, '').split(/\s+/).slice(-2).join(' ') : 'street');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArchiveResult | null>(null);
  const search = async () => {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      if (socialLink.live && (place !== p.archivePlace || yearFrom !== p.yearFrom || yearTo !== p.yearTo)) void socialLink.request({ type: 'perspective-settings', perspectiveId: p.id, archivePlace: place, yearFrom, yearTo }).catch(() => undefined);
      setResult(await searchArchive(session, { place, yearFrom, yearTo, terms }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const hang = async (referenceId: string) => {
    if (!session) return;
    const n = pins.filter((x) => x.perspectiveId === p.id).length;
    // On the back wall, side by side, a little below this perspective's eye line.
    const placement = { x: -1.5 + (n % 4) * 1.0, y: Math.min(1.6, Math.max(0.95, p.eyeHeight - 0.12)), z: -2.18, yaw: 0, scale: 1, on: null };
    try { await pinArchive(session, referenceId, p.id, placement); notify('Hung in the place, for these eyes'); onClose(); }
    catch (e) { setError((e as Error).message); }
  };
  return (
    <Sheet title="Old photographs of the place" onClose={onClose} testId="archive-sheet">
      <p>Public photographs from the Library of Congress, from around that time. They show the era, not your family.</p>
      <div className="archive-form">
        <label className="social-field"><span>Place</span><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="San Francisco" maxLength={100} data-testid="archive-place" /></label>
        <label className="social-field narrow"><span>From</span><input type="number" value={yearFrom} min={1000} max={2100} onChange={(e) => setFrom(Number(e.target.value))} /></label>
        <label className="social-field narrow"><span>To</span><input type="number" value={yearTo} min={1000} max={2100} onChange={(e) => setTo(Number(e.target.value))} /></label>
        <label className="social-field"><span>Looking for</span><input value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={100} /></label>
      </div>
      <button type="button" className="pill glass" disabled={busy || place.trim().length < 2 || !session} onClick={() => void search()} data-testid="archive-search">{busy ? 'Looking (this can take a minute)…' : 'Look'}</button>
      {error && <p className="social-error" role="alert">{error}</p>}
      {result && (
        <ul className="archive-results">
          {result.references.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <small>{r.date}{r.dateMatch === 'unknown' ? ' · date uncertain' : ''} · {r.imageUrl ? 'photograph can be shown' : 'record only (rights unclear)'}</small>
              </div>
              <button type="button" className="pill glass" onClick={() => void hang(r.id)} data-testid="archive-hang">Hang it here</button>
            </li>
          ))}
          {!result.references.length && <li className="muted">Nothing from that time came back. Try a nearby place or wider years.</li>}
        </ul>
      )}
    </Sheet>
  );
}

function AvatarSheet({ onClose }: { onClose: () => void }) {
  const session = useGate((s) => s.session);
  const [key, setKey] = useState(readKey());
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [minor, setMinor] = useState(false);
  const [guardian, setGuardian] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async () => {
    if (!session || !file) return;
    setBusy(true); setError(null);
    try {
      const url = await convex.mutation(api.avatars.uploadUrl, { code: session.code, token: session.token });
      const fileId = await uploadFile(url, file);
      const r = await convex.action(api.avatars.register, { code: session.code, token: session.token, fileId: fileId as Id<'_storage'>, label: label || 'Family member', subjectIsMinor: minor, ...(minor ? { guardianName: guardian, guardianAgrees: agree } : {}) });
      writeKey(r.key); setKey(r.key);
      if (socialLink.live) await socialLink.request({ type: 'avatar', key: r.key });
      notify('Your likeness is shown in this visit');
      onClose();
    } catch (e) { setError((e as Error).message.replace(/^.*?ConvexError:\s*/, '')); } finally { setBusy(false); }
  };
  const stop = async () => {
    if (!session || !key) return;
    await convex.mutation(api.avatars.revoke, { code: session.code, token: session.token, key }).catch(() => undefined);
    if (socialLink.live) await socialLink.request({ type: 'avatar-clear' }).catch(() => undefined);
    writeKey(null); setKey(null); notify('Your likeness is no longer shared');
  };
  return (
    <Sheet title="How others see you" onClose={onClose} testId="avatar-sheet">
      <p>Build your likeness from your own photos on your computer (the guide is in docs/AVATARS.md). Only the finished 3D model is uploaded; the photos stay with you.</p>
      {key ? (
        <div className="social-actions">
          <button type="button" className="pill glass" onClick={() => void socialLink.request({ type: 'avatar', key }).then(() => notify('Wearing your likeness'), (e: Error) => setError(e.message))}>Wear it in this visit</button>
          <button type="button" className="quiet-link" onClick={() => void stop()} data-testid="avatar-stop">Stop sharing it</button>
        </div>
      ) : (
        <>
          <label className="social-field"><span>Model (.glb)</span><input type="file" accept=".glb,model/gltf-binary" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="avatar-file" /></label>
          <label className="social-field"><span>Whose likeness</span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Grandpa Joe" /></label>
          <label className="social-check"><input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} data-testid="avatar-minor" /> This person is under 18</label>
          {minor && (
            <>
              <label className="social-field"><span>Parent or guardian’s name</span><input value={guardian} onChange={(e) => setGuardian(e.target.value)} maxLength={80} data-testid="avatar-guardian" /></label>
              <label className="social-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="avatar-agree" /> I am their parent or guardian, and I agree to their likeness being shown to the family in these visits.</label>
            </>
          )}
          <button type="button" className="pill glass" disabled={busy || !file || !session || (minor && (!agree || guardian.trim().length < 2))} onClick={() => void upload()} data-testid="avatar-upload">{busy ? 'Uploading…' : 'Share my likeness'}</button>
        </>
      )}
      {error && <p className="social-error" role="alert">{error}</p>}
    </Sheet>
  );
}

function Notice() {
  const notice = useSocial((s) => s.notice);
  const [, tick] = useState(0);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => tick((n) => n + 1), 3200); return () => clearTimeout(t); }, [notice]);
  if (!notice || Date.now() - notice.at > 3000) return null;
  return <p className="social-notice glass" role="status" data-testid="social-notice">{notice.text}</p>;
}

export function SocialUI() {
  const stage = useGate((s) => s.stage);
  const xr = useGate((s) => s.xr);
  const session = useGate((s) => s.session);
  const viewing = useSocial((s) => s.viewing);
  const view = useSocial((s) => s.view);
  const chosen = useSocial((s) => s.chosen);
  const live = useSocial((s) => s.status === 'live');
  const perspectives = useSocial((s) => s.perspectives);
  const [sheet, setSheet] = useState<null | 'pick' | 'compose' | 'archive' | 'avatar'>(null);
  const p = perspectives.find((x) => x.key === viewing);
  const day = stage === 'forming' || stage === 'memory' || stage === 'leaving';
  const touch = useMemo(() => matchMedia('(pointer: coarse)').matches, []);

  // A new visit starts fresh; guests look through their own eyes by default, the host at the whole place. Once per
  // visit: effects also run again when the page re-suspends (a model loading), which must never undo a choice (a guest
  // who chose the grandparent's eyes was sent back to the grandchild's).
  useEffect(() => {
    if (!session || freshFor === `${session.code}:${session.token}`) return;
    freshFor = `${session.code}:${session.token}`;
    useSocial.getState().set({ chosen: false, viewing: session.role === 'guest' ? 'child' : 'grandparent', view: session.role === 'guest' ? 'first' : 'overview' });
  }, [session]);
  // Which prepared world this visit's memory is shown in (the team's cached meadow, say): perspectives stand at its
  // checked viewpoints instead of the sketch room's spots.
  const roomView = useQuery(api.rooms.get, session ? { code: session.code, token: session.token } : 'skip');
  const worldId = roomView?.splat?.status === 'ready' && roomView.splat.source === 'worldlabs' ? roomView.splat.worldId ?? null : null;
  useEffect(() => { useSocial.getState().set({ worldId }); }, [worldId]);
  // Someone who joins takes the perspective nobody has claimed yet (a laptop already seeing through the grandchild's
  // eyes leaves the grandparent's for the headset that joins), until they choose for themselves.
  const memberId = useSocial((s) => s.memberId);
  useEffect(() => {
    if (chosen || !live) return;
    const mine = perspectives.find((x) => x.key === viewing);
    const free = perspectives.find((x) => x.key !== viewing && !x.claimedBy);
    if (mine?.claimedBy && mine.claimedBy !== memberId && free) useSocial.getState().set({ viewing: free.key });
  }, [chosen, live, perspectives, viewing, memberId]);
  // Whose eyes this person sees through isn't a form any more: the companion hears it ("with my grandmother") or asks
  // once in words (flow/controller.ts). The perspective chip still opens the picker for anyone who wants to choose.
  // Wear a likeness this device shared before (or one handed over as ?avatar=KEY) once the visit is live.
  useEffect(() => {
    const fromLink = new URLSearchParams(location.search).get('avatar');
    if (fromLink && /^[a-z0-9]{40}$/.test(fromLink)) writeKey(fromLink);
    const key = readKey();
    if (live && key) void socialLink.request({ type: 'avatar', key }).catch(() => writeKey(null));
  }, [live]);

  if (xr || stage === 'portal' || stage === 'album') return null;
  return (
    <>
      <nav className="social-dock" aria-label="Perspectives" data-testid="social-dock">
        <button type="button" className="pill glass perspective-chip" style={{ '--p': p?.color ?? '#cdb4ff' } as React.CSSProperties} onClick={() => setSheet('pick')} data-testid="perspective-chip">
          <span className="dot" aria-hidden="true" />{p ? `${p.label}’s eyes` : 'Whose eyes?'}
        </button>
        {day && (
          <div className="seg glass" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'first'} onClick={() => useSocial.getState().set({ view: 'first' })} data-testid="view-first">My view</button>
            <button type="button" aria-pressed={view === 'overview'} onClick={() => useSocial.getState().set({ view: 'overview' })} data-testid="view-overview">Overview</button>
          </div>
        )}
        {day && live && <button type="button" className="pill glass" onClick={() => setSheet('compose')} data-testid="add-memory">Add a memory</button>}
        {day && live && <button type="button" className="pill glass" onClick={() => setSheet('archive')} data-testid="open-archive">Old photos</button>}
        {live && <button type="button" className="pill glass" onClick={() => setSheet('avatar')} data-testid="open-avatar">My likeness</button>}
        {!live && session && inMemory() && <span className="social-local" title="Saving perspectives needs the team’s exchange">Kept on this device only</span>}
      </nav>
      {/* Walking about through these eyes: the Red Kite walk pad on a phone, the keys on a laptop. */}
      {day && view === 'first' && (touch
        ? <div className="social-walk"><TouchPad input={walkPad} disabled={stage === 'forming'} /></div>
        : <p className="social-walk-keys" aria-hidden="true">W A S D to walk · R back to your place</p>)}
      <Handoffs />
      <StoryCard />
      <Notice />
      {sheet === 'pick' && <PerspectivePicker onClose={() => setSheet(null)} />}
      {sheet === 'compose' && <Composer onClose={() => setSheet(null)} />}
      {sheet === 'archive' && <ArchiveSheet onClose={() => setSheet(null)} />}
      {sheet === 'avatar' && <AvatarSheet onClose={() => setSheet(null)} />}
    </>
  );
}
