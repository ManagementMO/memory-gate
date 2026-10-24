import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { fileUrl } from '../backend';
import { agoOf, timeOf } from '../format';
import { useNow, useRunner } from '../hooks';
import { normalizePhoto, TONE_LABEL, type Normalized } from '../image';
import { SAMPLE } from '../sample';
import type { Session } from '../session';
import { Chip, Notice, Spinner, useToast } from '../ui';

type RoomView = FunctionReturnType<typeof api.rooms.get>;
type SplatRow = RoomView['recentSplats'][number];

function reasonText(error: string | null): string {
  if (!error) return '';
  if (/vendor_upload_modal/.test(error)) return 'The GPU-service permission is off.';
  if (/splat\.live off/.test(error)) return 'Live room building is switched off right now.';
  if (/timed out/.test(error)) return 'The room builder took too long.';
  if (/calibration/.test(error)) return 'The provider did not return usable scale/floor metadata. Keep the illustrative courtyard for headset use.';
  if (/generation limit/.test(error)) return 'The deployment has used its configured world submissions. Choose a saved world or the illustrative courtyard.';
  if (/failed/i.test(error)) return 'The room builder had a problem.';
  return '';
}

export function splatMessage(s: SplatRow, now: number): { tone: 'busy' | 'ok' | 'fallback' | 'failed'; text: string; detail: string } {
  if (s.source === 'worldlabs' && (s.status === 'queued' || s.status === 'running')) return { tone: 'busy', text: s.sourceStory ? 'Imagining the place from the story…' : 'Imagining the place from your photo…', detail: `World Labs · ${agoOf(s.createdAt, now)} · you can keep telling the story meanwhile` };
  if (s.status === 'queued') return { tone: 'busy', text: 'Waiting for the room builder…', detail: `${agoOf(s.createdAt, now)} so far` };
  if (s.status === 'running') return { tone: 'busy', text: 'Building the room… usually under a minute', detail: `${agoOf(s.createdAt, now)} so far` };
  if (s.status === 'failed') return { tone: 'failed', text: s.sourceStory ? 'The imagined place could not be saved. Your story and current setting are still available.' : 'We couldn’t build a room from this photo. You can keep exploring the illustrative courtyard.', detail: reasonText(s.error) };
  if (s.source === 'prebaked' && s.error) return { tone: 'fallback', text: 'Using the sample room instead', detail: reasonText(s.error) };
  if (s.source === 'prebaked') return { tone: 'ok', text: 'Sample room ready (prebaked)', detail: 'Built during prep from the public-domain 1938 photo.' };
  if (s.source === 'worldlabs') return { tone: 'ok', text: s.sourceStory ? 'Story world ready for review' : 'Photo world ready for review', detail: 'AI interpretation, with generated details that are unverified. Press Show this room when you are ready.' };
  return { tone: 'ok', text: 'Your room is ready. The headset shows it now.', detail: s.readyAt ? `Ready at ${timeOf(s.readyAt)}` : '' };
}

export function Photo({ session, view, onDone, onConsent }: { session: Session; view: RoomView; onDone: () => void; onConsent: () => void }) {
  const toast = useToast();
  const now = useNow(1000);
  const genUrl = useMutation(api.splats.generatePhotoUploadUrl);
  const addPhoto = useMutation(api.splats.addPhoto);
  const setActive = useMutation(api.splats.setActive);
  const { busy, run } = useRunner(toast.report);
  const [photo, setPhoto] = useState<(Normalized & { sample: boolean }) | null>(null);
  const [caption, setCaption] = useState('');
  const [credit, setCredit] = useState(`Shared by ${session.name}`);
  const [readError, setReadError] = useState<string | null>(null);
  const [sentSplat, setSentSplat] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [builder, setBuilder] = useState<'auto' | 'worldlabs'>('auto');
  const fileInput = useRef<HTMLInputElement>(null);

  const active = new Set(view.consents.flatMap((c) => c.scopes));
  const canUpload = view.me.role === 'family';
  const hasConsent = active.has('photo_processing');
  const willUseSample = builder === 'worldlabs' ? null : !view.flags['splat.live'] ? 'Live photo reconstruction is off. A prepared sample room is used when available; otherwise you can explore the illustrative courtyard.'
    : !active.has('vendor_upload_modal') ? 'The GPU-service permission is off. A prepared sample room is used when available; otherwise you can explore the illustrative courtyard.' : null;

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.previewUrl); }, [photo]);

  async function choose(file: Blob, sample: boolean) {
    setReadError(null);
    try {
      const n = await normalizePhoto(file);
      setPhoto({ ...n, sample });
      setSent(false);
      if (sample) { setCaption(SAMPLE.caption); setCredit(SAMPLE.credit); }
      else {
        if (credit === SAMPLE.credit) setCredit(`Shared by ${session.name}`);
        if (caption === SAMPLE.caption) setCaption('');
      }
    } catch {
      setReadError('We couldn’t read that picture. Try a JPEG or PNG photo, or take a photo of the print.');
    }
  }

  async function useSamplePhoto() {
    try {
      const r = await fetch(SAMPLE.photoUrl);
      if (!r.ok) throw new Error(String(r.status));
      await choose(await r.blob(), true);
    } catch {
      setReadError('The sample photo didn’t load. Reload the page and try again.');
    }
  }

  async function upload() {
    if (!photo) return;
    const r = await run('upload', async () => {
      const target = fileUrl(await genUrl({ code: session.code, token: session.token }));
      if (!target) throw new Error('upload url');
      const res = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: photo.blob });
      if (!res.ok) throw new Error(`upload failed ${res.status}`);
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
      return addPhoto({
        code: session.code, token: session.token, fileId: storageId, width: photo.width, height: photo.height, tone: photo.tone, builder,
        credit: credit.trim() || `Shared by ${session.name}`, ...(caption.trim() ? { caption: caption.trim().slice(0, 140) } : {}),
      });
    });
    if (r.ok) { setSentSplat(r.value.splatId); setSent(true); toast.say('Photo received. Building the room…', 'ok'); }
  }

  const current = view.splat;
  const latest = view.recentSplats[0];

  return (
    <section className="screen" data-testid="photo-screen" aria-labelledby="photo-h">
      <h2 id="photo-h">The photo</h2>
      <p className="lede">Choose an old photo of a room. It becomes the place the storyteller stands in.</p>

      <div className="card current-room" data-testid="photo-current">
        <p className="muted small">The headset is showing</p>
        <p className="big-line">
          {current ? (current.source === 'prebaked' ? 'The sample room (1938 living room)' : current.sourceStory ? 'A place imagined from the story' : 'An AI interpretation of your photo') : 'Illustrative courtyard · independent of the photo'}
          {current?.source === 'prebaked' && <Chip kind="sample">Sample</Chip>}
        </p>
        {current && canUpload && <button type="button" className="btn btn-quiet" disabled={busy !== null}
          onClick={() => run('courtyard', () => setActive({ code: session.code, token: session.token, splatId: null }))}>
          Use illustrative courtyard · keep objects and story
        </button>}
      </div>

      {!canUpload ? (
        <Notice tone="info" title="Only family members can add the photo.">You can still follow the story on the Story tab.</Notice>
      ) : !hasConsent ? (
        <Notice tone="warn" title="Permission needed" testId="photo-needs-consent">
          Turning a photo into a room needs the “Turn the photo into a 3D room” permission.
          <div className="row"><button type="button" className="btn btn-primary" onClick={onConsent}>Open Permissions</button></div>
        </Notice>
      ) : (
        <div className="card">
          <div className="row wrap">
            <button type="button" className={`btn ${view.room.demo ? '' : 'btn-primary'}`} onClick={() => fileInput.current?.click()} data-testid="photo-choose">Choose a photo</button>
            <button type="button" className={`btn ${view.room.demo ? 'btn-primary' : ''}`} onClick={useSamplePhoto} data-testid="photo-use-sample">Use the sample photo</button>
          </div>
          <input ref={fileInput} type="file" accept="image/*" className="visually-hidden" data-testid="photo-input" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f, false); e.target.value = ''; }} />
          {readError && <Notice tone="error" testId="photo-read-error">{readError}</Notice>}

          {photo && (
            <div className="photo-preview" data-testid="photo-preview">
              <figure>
                <img src={photo.previewUrl} alt={photo.sample ? 'Sample photo: a 1938 living room' : 'The photo you chose'} />
                <figcaption>
                  <Chip kind="tone" testId="photo-tone">{TONE_LABEL[photo.tone]}</Chip>
                  {photo.sample && <Chip kind="sample">Sample, public domain</Chip>}
                  <span className="muted small">{photo.width} × {photo.height}</span>
                </figcaption>
              </figure>
              <label className="field">
                <span>Caption (optional)</span>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} placeholder="The front room on Elm Street" />
              </label>
              <label className="field">
                <span>Who shared it</span>
                <input value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={80} data-testid="photo-credit" />
              </label>
              <label className="field"><span>How to make the place</span>
                <select data-testid="photo-builder" value={builder} onChange={e => setBuilder(e.target.value as typeof builder)} disabled={sent}>
                  <option value="auto">Prepared scene / local courtyard{view.flags['splat.live'] ? ' (or SHARP photo world)' : ''}</option>
                  <option value="worldlabs" disabled={!view.flags['worldlabs.generate']}>Photo world with World Labs{!view.flags['worldlabs.generate'] ? ' (unavailable)' : ''}</option>
                </select>
              </label>
              {builder === 'worldlabs' && <Notice tone="info">This sends the photo to World Labs for a private Marble 1.1 world (normally 1,580 API credits for an ordinary photo, including panorama preparation). It can take several minutes. The result is an interpretation; review it before showing it in the headset.
                {!active.has('vendor_upload_worldlabs') && <div className="row"><button className="btn" onClick={onConsent}>Allow World Labs in Permissions</button></div>}
              </Notice>}
              {willUseSample && <p className="muted small" data-testid="photo-will-sample">{willUseSample}</p>}
              <button type="button" className="btn btn-primary btn-wide" onClick={upload} disabled={busy !== null || sent || (builder === 'worldlabs' && !active.has('vendor_upload_worldlabs'))} data-testid="photo-upload">
                {busy === 'upload' ? 'Sending the photo…' : sent ? 'Sent. Progress is below.' : builder === 'worldlabs' ? 'Generate photo interpretation' : 'Build the room'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card" data-testid="photo-status">
        <h3>Room building</h3>
        {view.recentSplats.length === 0 ? <p className="muted">No rooms built yet.</p> : (
          <ul className="splats">
            {view.recentSplats.map((s) => {
              const m = splatMessage(s, now);
              const isCurrent = current?.id === s.id;
              return (
                <li key={s.id} className={`splat splat-${m.tone}`} data-testid="splat-row" data-status={s.status} data-source={s.source} data-mine={sentSplat === s.id ? 'yes' : 'no'}>
                  <p className="splat-line">
                    {m.tone === 'busy' && <Spinner label="Working" />}
                    <strong data-testid="splat-message">{m.text}</strong>
                  </p>
                  {m.detail && <p className="muted small">{m.detail}</p>}
                  {s.previewUrl && <img className="place-preview" src={fileUrl(s.previewUrl) ?? ''} alt="Generated setting preview" loading="lazy" />}
                  <p className="muted small">Started {timeOf(s.createdAt)}{isCurrent ? ' · showing now' : ''}</p>
                  {s.status === 'ready' && !isCurrent && canUpload && (
                    <button type="button" className="btn btn-quiet" onClick={() => run('activate', () => setActive({ code: session.code, token: session.token, splatId: s.id }))}>
                      Show this room
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {latest && latest.status !== 'ready' && latest.status !== 'failed' && (
          <p className="muted small">{latest.source === 'worldlabs' ? 'Keep exploring the current scene. Your photo world will wait for review when it is ready.' : 'If building fails or takes too long, a prepared sample is used when available. The illustrative courtyard remains available.'}</p>
        )}
      </div>

      <button type="button" className="btn btn-wide" onClick={onDone} data-testid="photo-continue">Continue to the story</button>
    </section>
  );
}
