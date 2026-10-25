import { useAction, useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { sourceMediaUrl, type PerspectiveOption, type RoomAuth } from '../memory-objects/types';
import { MEMORY_OBJECTS, type MemoryObject, type MemorySource, type SourceLibrary as Library } from './memory-lens';
import './sources.css';
import { prepareFamilyPhoto } from '../memory-objects/uploadPhoto';
import { sourceError } from '../memory-objects/errors';

export function useImportProgress(session: RoomAuth | null, library: Library | undefined) {
  const refresh = useAction(api.memoryImport.refresh);
  const running = library?.jobs.find(j => j.status === 'running' && j.runId);
  const code = session?.code, token = session?.token, id = running?._id;
  useEffect(() => {
    if (!code || !token || !id) return;
    let stopped = false, busy = false;
    const poll = async () => { if (stopped || busy) return; busy = true; try { await refresh({ code, token, id }); } catch { /* The saved job stays visible; manual refresh remains available. */ } finally { busy = false; } };
    void poll(); const timer = setInterval(() => void poll(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [code, token, id, refresh]);
}

const samplePerspectives = [{ key: 'elena', label: 'Elena' }, { key: 'rosa', label: 'Rosa' }];
export function SourceLibrary({ session, library, perspective, perspectives = samplePerspectives, paused, onClose, onMakeObject }: { session: RoomAuth; library: Library | undefined; perspective: string; perspectives?: PerspectiveOption[]; paused: boolean; onClose: () => void; onMakeObject?: (id: Id<'memorySources'>) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [urls, setUrls] = useState(''), [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null), [photoCaption, setPhotoCaption] = useState('');
  const start = useAction(api.memoryImport.start), refresh = useAction(api.memoryImport.refresh);
  const upload = useAction(api.memoryUpload.photo);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const auth = { code: session.code, token: session.token };
  async function run(fn: () => Promise<unknown>) { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(sourceError(e)); } finally { setBusy(false); } }
  const importing = library?.jobs.some(j => j.status === 'running');
  return <dialog className="memory-library" ref={dialog} onCancel={e => { e.preventDefault(); onClose(); }} aria-labelledby="memory-library-title" data-testid="source-library">
    <header><div><p className="rk-eyebrow">Photos that start a conversation</p><h2 id="memory-library-title">Bring a memory closer.</h2></div><button onClick={onClose} aria-label="Close photo sources">×</button></header>
    <p>Choose a public family post, review its photos, then attach a detail to an object. Each person’s telling stays their own.</p>
    {library?.canAuthor && <section className="memory-import" aria-label="Import public photos">
      <label>Public Instagram photo posts<textarea data-testid="post-urls" rows={2} value={urls} onChange={e => setUrls(e.target.value)} placeholder="https://www.instagram.com/p/…/ — up to 3, one per line" maxLength={500} /></label>
      <label className="memory-permission"><input type="checkbox" checked={permission} onChange={e => setPermission(e.target.checked)} />I have permission to use these photos and share them with this room.</label>
      {library.offline ? <p className="memory-hint">This sample stays offline. <a href="/?story=red-kite&sources=live">Open a live import copy</a> to import public posts with Apify.</p> : !library.configured ? <p className="memory-hint">Live Apify import needs the operator’s server configuration. The fictional example below works now.</p> : <p className="memory-hint">Apify retrieves photos and captions. Review them here before anyone else sees them.</p>}
      <div className="memory-actions"><button data-testid="import-posts" disabled={busy || paused || importing || !permission || !urls.trim() || library.offline || !library.configured} onClick={() => void run(() => start({ ...auth, mode: 'cloud', urls: urls.split(/\s+/).filter(Boolean), permission }))}>Import with Apify</button>{library.demo && <button data-testid="sample-source" disabled={busy || paused || importing || !permission} onClick={() => void run(() => start({ ...auth, mode: 'fixture', urls: [], permission }))}>Try fictional kite example</button>}</div>
      <p className="memory-hint">The example is an original illustration, not an Instagram scrape. A live import makes a bounded cloud run; it does not generate a world.</p>
      <h3>Or use your own family photo</h3><label>Family photo<input data-testid="family-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} /></label><label>Photo caption<input value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} maxLength={2200} placeholder="Who shared this photo, or what it shows" /></label>
      <button data-testid="upload-family-photo" disabled={busy || paused || !permission || !photoFile} onClick={() => void run(async () => { if (!photoFile) return; const bytes = await prepareFamilyPhoto(photoFile); await upload({ ...auth, bytes, caption: photoCaption, permission, commandId: crypto.randomUUID() }); setPhotoFile(null); setPhotoCaption(''); })}>{busy ? 'Preparing photo…' : 'Upload for private review'}</button><p className="memory-hint">Selected post links go to Apify. Uploaded photos stay in this memory; they are resized and their embedded metadata is removed. Sending a photo to Tripo is a separate choice.</p>
    </section>}
    {error && <p role="alert" className="memory-error">{error}</p>}
    {library?.jobs.filter(j => j.kind !== 'place').slice(-1).map(job => <p key={job._id} className="memory-job" role="status" data-testid="import-status">{job.status === 'running' ? 'Apify is retrieving the selected posts. You can close this panel and keep exploring.' : job.error || (job.mode === 'fixture' ? 'Fictional example ready for review.' : job.mode === 'upload' ? 'Family photo ready for review.' : 'Apify photos ready for review.')}{job.runId && <> <a href={`https://console.apify.com/actors/runs/${job.runId}`} target="_blank" rel="noreferrer">View Apify run ↗</a>{job.status === 'running' && <button disabled={busy} onClick={() => void run(() => refresh({ ...auth, id: job._id }))}>Check run</button>}</>}</p>)}
    <div className="memory-cards">{library?.sources.map(source => <SourceCard key={source._id} source={source} session={session} canAuthor={library.canAuthor} perspective={perspective} perspectives={perspectives} paused={paused} onMakeObject={onMakeObject} />)}</div>
    {library && !library.sources.length && <p className="memory-empty">No photos attached yet. A kite, a flower, or a familiar place can become a doorway into someone’s story.</p>}
    <footer>Public captions and family notes are attributed sources. They cannot establish what someone remembers. Removing a source deletes this room’s copy; Apify run data follows the account’s retention settings.</footer>
  </dialog>;
}

function SourceCard({ source: s, session, canAuthor, perspective, perspectives, paused, onMakeObject }: { source: MemorySource; session: RoomAuth; canAuthor: boolean; perspective: string; perspectives: PerspectiveOption[]; paused: boolean; onMakeObject?: (id: Id<'memorySources'>) => void }) {
  const [object, setObject] = useState<MemoryObject>((s.suggestedObjects[0] as MemoryObject) || 'kite');
  const [telling, setTelling] = useState(perspective), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const attach = useAction(api.memoryImport.attach), remove = useMutation(api.memorySources.remove);
  const auth = { code: session.code, token: session.token };
  async function run(fn: () => Promise<unknown>) { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(sourceError(e)); } finally { setBusy(false); } }
  return <article className="memory-card" data-testid={s.approved ? 'approved-source' : 'draft-source'}>
    {s.imageUrl && <img src={sourceMediaUrl(s.imageUrl) ?? undefined} alt={s.execution === 'fixture' ? 'Fictional illustration of a kite in a meadow' : `Source photo shared by ${s.owner}`} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.hidden = true; }} />}
    <div><p className="memory-badge">{s.execution === 'fixture' ? 'Fictional example · no Apify run' : s.execution === 'family-upload' ? 'Family photo · direct upload' : 'Retrieved by Apify · public Instagram post'}{s.approved ? ' · attached' : ' · private preview'}</p><h3>{s.owner}</h3>{s.timestamp && <time dateTime={s.timestamp}>{new Date(s.timestamp).toLocaleDateString()}</time>}<blockquote>{s.caption || 'No caption was provided.'}</blockquote>
      {s.sourceUrl && <a href={s.sourceUrl} target="_blank" rel="noreferrer">Original post ↗</a>}
      {s.approved ? <><p>Attached to {MEMORY_OBJECTS[s.objectKey as MemoryObject]?.label ?? s.objectKey} · {perspectives.find(p => p.key === s.perspective)?.label ?? s.perspective}’s perspective</p>{s.note && <p><strong>Family note:</strong> {s.note}</p>}{canAuthor && onMakeObject && <button data-testid="photo-to-object" disabled={busy || paused} onClick={() => onMakeObject(s._id)}>Make an optional 3D object</button>}</> : canAuthor && <>
        {s.suggestedObjects.length > 0 && <p className="memory-hint">Caption suggests: {s.suggestedObjects.join(', ')}. Choose the object yourself.</p>}
        <div className="memory-selects"><label>Connect to<select value={object} onChange={e => setObject(e.target.value as MemoryObject)}>{Object.entries(MEMORY_OBJECTS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label><label>Whose perspective?<select value={telling} onChange={e => setTelling(e.target.value)}>{perspectives.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label></div>
        <label>A detail to talk about<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={400} rows={2} placeholder="For example: The ribbon reminds me of the one Grandma tied." /></label>
        <button data-testid="attach-source" disabled={busy || paused} onClick={() => void run(() => attach({ ...auth, id: s._id, objectKey: object, perspective: telling, note }))}>{busy ? 'Saving photo…' : 'Attach reviewed photo'}</button>
      </>}
      {canAuthor && <button className="memory-remove" disabled={busy || paused} onClick={() => void run(() => remove({ ...auth, id: s._id }))}>{s.approved ? 'Remove from memory' : 'Discard photo'}</button>}
      {error && <p role="alert" className="memory-error">{error}</p>}
    </div>
  </article>;
}
