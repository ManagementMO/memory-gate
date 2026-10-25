import { useAction, useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { MEMORY_ASSETS } from '../../../../packages/shared/src/memoryObjects';
import type { SourceLibrary } from '../red-kite/memory-lens';
import type { ModelId, ObjectLibrary, PerspectiveOption, RoomAuth } from './types';
import '../red-kite/sources.css';
import './objects.css';
import { sourceError } from './errors';

export function useModelProgress(auth: RoomAuth | null, objects: ObjectLibrary | undefined) {
  const refresh = useAction(api.memoryModels.refresh);
  const job = objects?.objects.find(o => ['generating', 'downloading'].includes(o.status) && o.taskId);
  const code = auth?.code, token = auth?.token, id = job?._id;
  useEffect(() => {
    if (!code || !token || !id) return;
    let live = true, busy = false;
    const poll = async () => { if (!live || busy) return; busy = true; try { await refresh({ code, token, id }); } catch { /* Saved task remains available for manual checks. */ } finally { busy = false; } };
    void poll(); const timer = setInterval(() => void poll(), 5000);
    return () => { live = false; clearInterval(timer); };
  }, [code, token, id, refresh]);
}

export function PlaceLibrary({ auth: session, objects, sources, perspectives, perspective, memoryKey = 'red-kite', paused, initialSourceId, onClose, onPhotos, onPreview }: {
  auth: RoomAuth; objects: ObjectLibrary | undefined; sources: SourceLibrary | undefined; perspectives: PerspectiveOption[]; perspective: string;
  memoryKey?: string; paused: boolean; initialSourceId?: Id<'memorySources'> | null; onClose: () => void; onPhotos: () => void; onPreview: (id: ModelId, perspective: string) => void;
}) {
  const auth = { code: session.code, token: session.token };
  const dialog = useRef<HTMLDialogElement>(null), inFlight = useRef(false);
  const [query, setQuery] = useState(''), [permission, setPermission] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [reference, setReference] = useState(initialSourceId ? 'photo:' + initialSourceId : ''), [choice, setChoice] = useState('builtin:bridge');
  const [label, setLabel] = useState('The footbridge'), [note, setNote] = useState(''), [telling, setTelling] = useState(perspective), [vendor, setVendor] = useState(false);
  const find = useAction(api.memoryImport.findPlace), create = useAction(api.memoryModels.create), refresh = useAction(api.memoryModels.refresh), refreshImport = useAction(api.memoryImport.refresh);
  const approve = useMutation(api.memoryObjects.approvePlace), removePlace = useMutation(api.memoryObjects.removePlace);
  const place = useMutation(api.memoryObjects.place), hide = useMutation(api.memoryObjects.hide), remove = useMutation(api.memoryObjects.remove), resize = useMutation(api.memoryObjects.resize);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  async function run(fn: () => Promise<unknown>) { if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(sourceError(e)); } finally { inFlight.current = false; setBusy(false); } }
  const jobs = sources?.jobs.filter(j => j.kind === 'place') ?? [], importing = sources?.jobs.some(j => j.status === 'running');
  const photos = sources?.sources.filter(s => s.approved) ?? [], candidates = objects?.objects.filter(o => (o.memoryKey ?? 'red-kite') === memoryKey) ?? [];
  const selectedPhoto = reference.startsWith('photo:') ? photos.find(p => p._id === reference.slice(6)) : null;
  const generationAvailable = !!objects?.generationEnabled && !!selectedPhoto?.fileId && selectedPhoto.execution !== 'fixture';
  return <dialog ref={dialog} className="memory-library memory-workshop" aria-labelledby="object-workshop-title" data-testid="object-workshop" onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><div><p className="rk-eyebrow">A place. A photo. Something to talk about.</p><h2 id="object-workshop-title">Bring an object into the memory.</h2></div><button aria-label="Close places and objects" onClick={onClose}>×</button></header>
    <p>The kite is one example. Choose a place or family photo, review a model privately, then decide whether it belongs in this perspective.</p>
    {objects?.canAuthor && <>
      <section className="memory-import"><h3>1. Find a familiar place</h3><label>Public place or landmark<input data-testid="place-query" value={query} onChange={e => setQuery(e.target.value)} maxLength={120} placeholder="A park or landmark, with its town" /></label>
        <label className="memory-permission"><input type="checkbox" checked={permission} onChange={e => setPermission(e.target.checked)} />Send only this public place query to an outside search service. I will review the result.</label>
        <div className="memory-actions"><button data-testid="find-place" disabled={busy || paused || importing || !permission || query.trim().length < 3 || !sources?.configured || sources.offline} onClick={() => void run(() => find({ ...auth, query, mode: 'cloud', permission }))}>Find the place</button>{sources?.demo && <button data-testid="sample-place" disabled={busy || paused || importing} onClick={() => void run(() => find({ ...auth, query: 'Willowbrook Park', mode: 'fixture', permission: true }))}>Try fictional park example</button>}</div>
        <p className="memory-hint">{sources?.offline ? <>This sample stays offline. <a href="/?story=red-kite&sources=live&objects=1">Open a live import copy</a>.</> : !sources?.configured ? 'Live place search needs the operator’s search token. The park example works now.' : 'Up to three place references. Photo and review scraping are off.'} A map reference supplies context; it does not supply a 3D mesh.</p>
        {jobs.slice(-1).map(j => <p key={j._id} role="status" className="memory-job">{j.status === 'running' ? 'Finding the selected place…' : j.error || 'Place references are ready for review.'}{j.runId && <> <a href={`https://console.apify.com/actors/runs/${j.runId}`} target="_blank" rel="noreferrer">View run ↗</a>{j.status === 'running' && <button disabled={busy} onClick={() => void run(() => refreshImport({ ...auth, id: j._id }))}>Check run</button>}</>}</p>)}
        <div className="place-results">{objects.places.map(p => <article key={p._id} data-testid={p.approved ? 'approved-place' : 'place-result'}><strong>{p.title}</strong><p>{p.address}</p><small>{p.execution === 'fixture' ? 'Fictional example · no map search' : 'Retrieved · Google Maps reference'}</small>{p.sourceUrl && <p><a href={p.sourceUrl} target="_blank" rel="noreferrer">Place and photos on Google Maps ↗</a></p>}<div className="memory-actions">{!p.approved ? <button data-testid="approve-place" disabled={busy || paused} onClick={() => void run(async () => { await approve({ ...auth, id: p._id }); setReference('place:' + p._id); })}>Use this place reference</button> : <button disabled={busy || paused} onClick={() => setReference('place:' + p._id)}>Choose for an object</button>}<button disabled={busy || paused} onClick={() => void run(() => removePlace({ ...auth, id: p._id }))}>Remove place and its objects</button></div></article>)}</div>
      </section>
      <section className="memory-import"><h3>2. Choose what takes shape</h3>
        <label>Reviewed source<select data-testid="object-reference" value={reference} onChange={e => setReference(e.target.value)}><option value="">Choose a reviewed place or photo</option>{objects.places.filter(p => p.approved).map(p => <option key={p._id} value={'place:' + p._id}>{p.title}</option>)}{photos.map(p => <option key={p._id} value={'photo:' + p._id}>Photo · {p.owner}</option>)}</select></label>
        <button onClick={onPhotos}>Import or review a family photo</button>
        <label>Model option<select data-testid="object-model" value={choice} onChange={e => { setChoice(e.target.value); const asset = MEMORY_ASSETS[e.target.value.slice(8) as keyof typeof MEMORY_ASSETS]; if (asset) setLabel(asset.label); }}><optgroup label="Original illustrations · no generation">{Object.entries(MEMORY_ASSETS).map(([key, a]) => <option key={key} value={'builtin:' + key}>{a.label}</option>)}</optgroup>{objects.library.length > 0 && <optgroup label="Existing object library">{objects.library.map(l => <option key={l.key} value={'library:' + l.key}>{l.key} · {l.credit}</option>)}</optgroup>}<option value="image">Generate a shape from the approved photo · Tripo</option></select></label>
        <div className="memory-selects"><label>Object name<input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} /></label><label>Whose perspective?<select data-testid="object-perspective" value={telling} onChange={e => setTelling(e.target.value)}>{perspectives.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label></div>
        <label>Family explanation<textarea data-testid="object-note" value={note} onChange={e => setNote(e.target.value)} maxLength={400} rows={2} placeholder="What this object brings to mind, in your words." /></label>
        {choice === 'image' && <><label className="memory-permission"><input type="checkbox" checked={vendor} onChange={e => setVendor(e.target.checked)} />I have permission to use this selected family photo for 3D generation and send it to Tripo.</label><p className="memory-hint">{generationAvailable ? 'Creates a paid, low-poly shape. Review it before placing. Only the selected photo goes to Tripo.' : 'Select a cached real family photo in a live room; the operator must enable object generation. Original models work without a key.'} Map photos are linked at their source; they are not automatically sent for generation.</p></>}
        <button data-testid="create-object" disabled={busy || paused || !reference || !label.trim() || (choice === 'image' && (!generationAvailable || !vendor))} onClick={() => void run(async () => {
          const id = await create({ ...auth, sourceId: reference.startsWith('photo:') ? reference.slice(6) as Id<'memorySources'> : null, placeId: reference.startsWith('place:') ? reference.slice(6) as Id<'memoryPlaces'> : null, perspective: telling, memoryKey, choice, label, note, vendorConsent: vendor, commandId: crypto.randomUUID() });
          if (choice !== 'image') onPreview(id, telling);
        })}>{busy ? 'Preparing…' : choice === 'image' ? 'Generate a private candidate' : 'Prepare a private preview'}</button>
      </section>
    </>}
    {error && <p role="alert" className="memory-error">{error}</p>}
    <section className="object-candidates"><h3>3. Review before sharing</h3>{candidates.length === 0 && <p>No optional objects yet. Your existing memory stays as it is.</p>}{candidates.map(o => <article key={o._id} data-testid="object-candidate" data-status={o.status}>
      <div><strong>{o.label}</strong><span className="memory-badge">{o.perspective} · {o.status === 'placed' ? 'In this memory' : o.status === 'ready' ? 'Private candidate' : o.status} · {o.modelSource === 'tripo' ? 'AI-generated interpretation' : 'Library illustration'}</span></div>{o.note && <p>{o.note}</p>}{o.error && <p className="memory-error">{o.error}</p>}
      <div className="memory-actions">{o.url && <button data-testid="preview-object" disabled={paused} onClick={() => onPreview(o._id, o.perspective)}>Preview in the scene</button>}{objects?.canAuthor && <>{o.status === 'ready' && <button data-testid="place-object" disabled={busy || paused} onClick={() => void run(() => place({ ...auth, id: o._id }))}>Place in this perspective</button>}{o.status === 'placed' && <button data-testid="hide-object" disabled={busy || paused} onClick={() => void run(() => hide({ ...auth, id: o._id }))}>Hide object</button>}{o.taskId && !o.url && <button disabled={busy || paused} onClick={() => void run(() => refresh({ ...auth, id: o._id }))}>Check saved Tripo task</button>}<button data-testid="remove-object" disabled={busy || paused} onClick={() => void run(() => remove({ ...auth, id: o._id }))}>Delete candidate</button></>}</div>
      {objects?.canAuthor && o.url && <div className="memory-actions"><button disabled={busy || paused || o.size <= .25} onClick={() => void run(() => resize({ ...auth, id: o._id, size: Math.max(.25, o.size - .15), yaw: o.yaw }))}>Smaller</button><button disabled={busy || paused || o.size >= 1.4} onClick={() => void run(() => resize({ ...auth, id: o._id, size: Math.min(1.4, o.size + .15), yaw: o.yaw }))}>Larger</button><button disabled={busy || paused} onClick={() => void run(() => resize({ ...auth, id: o._id, size: o.size, yaw: (o.yaw + Math.PI / 2) % (Math.PI * 2) }))}>Turn 90°</button></div>}
    </article>)}</section>
    <footer>Objects are optional illustrations. A source and a family note stay with each one. Remove a source to remove its dependent objects. Provider run/task history follows the provider’s retention controls.</footer>
  </dialog>;
}
