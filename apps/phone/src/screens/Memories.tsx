import { useEffect, useRef, useState } from 'react';
import { useExchange, type ArchiveReference, type Capsule } from '../exchange';
import type { Session } from '../session';
import { Notice } from '../ui';
import '../exchange.css';

function ReferenceCard({ reference: r, children }: { reference: ArchiveReference; children?: React.ReactNode }) {
  return <article className="atlas-card">
    {r.imageUrl && <img loading="lazy" referrerPolicy="no-referrer" src={r.imageUrl} alt={`Archival reference: ${r.title}`} />}
    <div className="atlas-card-body"><p className="eyebrow">{r.publisher} · {r.date}</p><h3>{r.title}</h3>
      <p>{r.description || 'Explore the institution’s catalog record for more context.'}</p>
      <p className="small muted">{r.uncertainty}</p>
      <details><summary>Source &amp; image rights</summary><p className="small">{r.rights}</p><p className="small">Retrieved {new Date(r.retrievedAt).toLocaleDateString()}</p></details>
      <a className="btn btn-quiet" href={r.sourceUrl} target="_blank" rel="noreferrer">Open institution record ↗</a>{children}
    </div>
  </article>;
}

export function Memories({ session, onStory }: { session: Session; onStory: () => void }) {
  const exchange = useExchange(session);
  const { snapshot, opened, results, status, problem, request } = exchange;
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [sourceId, setSourceId] = useState(''); const [recipientId, setRecipientId] = useState(''); const [title, setTitle] = useState('');
  const [place, setPlace] = useState('San Francisco'); const [from, setFrom] = useState(1900); const [to, setTo] = useState(1980); const [terms, setTerms] = useState('street');
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => { return () => { audio.current?.pause(); }; }, [opened?.capsuleId]);
  async function perform(key: string, payload: Record<string, unknown>, success: string) {
    setBusy(key); setError(''); setNotice('');
    try { await request(payload); setNotice(success); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(''); }
  }
  const me = snapshot?.context.memberId;
  const recipients = snapshot?.context.members.filter(m => m.id !== me) ?? [];
  const incoming = snapshot?.capsules.filter(c => c.recipientId === me && c.status === 'pending') ?? [];
  const collection = snapshot?.capsules.filter(c => c.recipientId === me && c.status === 'accepted') ?? [];
  const sent = snapshot?.capsules.filter(c => c.senderId === me) ?? [];
  const disabled = Boolean(busy) || status !== 'connected' || snapshot?.context.paused;
  const respond = (c: Capsule, next: string) => perform(c.id, { type: 'respond', capsuleId: c.id, revision: c.revision, status: next }, next === 'accepted' ? 'Saved to your collection. Open it whenever you are ready.' : next === 'revoked' ? 'This memory can no longer be opened through the exchange.' : 'Memory removed from your collection.');
  return <section className="memory-exchange" data-testid="memory-exchange">
    <header className="exchange-hero"><div className="memory-seal" aria-hidden="true">✧</div><p className="eyebrow">A place between us</p>
      <h2>Some memories are<br />better held together.</h2><p>Pass a story in your own words. Let someone you love carry it with them.</p>
      <span className={`exchange-status ${status}`} role="status">{status === 'connected' ? '● Shared collection connected' : status === 'connecting' ? 'Connecting to your shared collection…' : 'Shared collection reconnecting'}</span>
    </header>
    {problem && <Notice tone="warn" title="Exchange connection">{problem}</Notice>}
    {error && <div role="alert" className="notice notice-error">{error}</div>}
    {notice && <p className="notice notice-ok" role="status">{notice}</p>}
    {snapshot?.context.paused && <Notice tone="info">The room is paused. Take your time; resume on Story when you are ready.</Notice>}
    {snapshot && <>
      <div className="exchange-people" aria-label="People in this room">{snapshot.context.members.map(m => <span key={m.id}><i className={snapshot.online.includes(m.id) ? 'online' : ''} aria-hidden="true" />{m.name}{m.id === me ? ' (you)' : ''}<small>{snapshot.online.includes(m.id) ? 'here' : 'away'}</small></span>)}</div>
      {incoming.length > 0 && <section className="incoming-memories" aria-label="Incoming memories"><p className="eyebrow">Someone thought of you</p>{incoming.map(c => <article className="memory-envelope" key={c.id} data-testid="incoming-memory">
        <span className="envelope-star" aria-hidden="true">✧</span><div><p className="small">From {c.senderName}, for you</p><h3>{c.title}</h3><p>You choose when to open it.</p></div>
        <div className="exchange-actions"><button className="btn btn-primary" disabled={disabled || !c.sourceAvailable} onClick={() => void respond(c, 'accepted')}>Accept memory</button><button className="btn btn-quiet" disabled={disabled} onClick={() => void respond(c, 'dismissed')}>No thanks</button></div>
      </article>)}</section>}
      <div className="exchange-columns"><section className="exchange-panel"><p className="eyebrow">Give a little of your world</p><h3>Pass a memory</h3>
        {snapshot.context.sources.length ? <form onSubmit={e => { e.preventDefault(); void perform('pass', { type: 'pass', sourceId, recipientId, title, commandId: crypto.randomUUID() }, 'Memory passed. It will wait for them to accept.'); }}>
          <label className="exchange-field">Your story<select required value={sourceId} onChange={e => setSourceId(e.target.value)}><option value="">Choose your original words</option>{snapshot.context.sources.map(s => <option key={s.id} value={s.id}>{s.transcript.slice(0, 100)}</option>)}</select></label>
          {sourceId && <blockquote>{snapshot.context.sources.find(s => s.id === sourceId)?.transcript}</blockquote>}
          <label className="exchange-field">A name for this memory<input required maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="The bench where we talked" /></label>
          <label className="exchange-field">For someone in this room<select required value={recipientId} onChange={e => setRecipientId(e.target.value)}><option value="">Choose a person</option>{recipients.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          {!recipients.length && <p className="small muted">Invite someone with your family link to pass them a memory.</p>}
          <button className="btn btn-primary btn-wide" disabled={disabled || !sourceId || !recipientId || !title.trim()}>{busy === 'pass' ? 'Passing your memory…' : 'Pass this memory →'}</button>
          <p className="small muted">Your original story stays linked to its source. The recipient decides whether to keep it.</p>
        </form> : <div className="exchange-empty"><p>Start with a few words about a place you remember. Your completed stories will appear here.</p><button className="btn btn-primary" onClick={onStory}>Tell a story</button></div>}
      </section><section className="exchange-panel"><p className="eyebrow">For you to keep</p><h3>Your collection <span className="memory-count">{collection.length}</span></h3>
        {!collection.length && <div className="exchange-empty"><span aria-hidden="true">✧</span><p>A little space for someone else’s world.</p><p className="small muted">Memories you accept stay here when you return.</p></div>}
        {collection.map(c => <article className="collection-card" key={c.id} data-testid="saved-memory"><p className="small muted">{c.senderName} shared</p><h4>{c.title}</h4><div className="exchange-actions"><button className="btn btn-primary" disabled={disabled || !c.sourceAvailable} onClick={() => void perform(c.id, { type: 'open', capsuleId: c.id }, '')}>Open memory</button><button className="btn btn-quiet" disabled={disabled} onClick={() => void respond(c, 'dismissed')}>Remove</button></div>{!c.sourceAvailable && <p>Its contributor is no longer sharing this story.</p>}</article>)}
      </section></div>
      {opened && <section className="opened-memory" data-testid="opened-memory" aria-label="Opened memory"><div className="exchange-actions"><p className="eyebrow">In {opened.source.speaker}’s own words</p><button className="btn btn-quiet" onClick={exchange.close}>Close memory</button></div><blockquote>{opened.source.transcript}</blockquote>
        {opened.source.translation && <p><span className="small muted">Translation</span><br />{opened.source.translation}</p>}
        {opened.source.audioUrl ? <><p className="small">Original recording · {opened.source.speaker}</p><audio ref={audio} controls src={opened.source.audioUrl} preload="none" /></> : <p className="small muted">{opened.source.source === 'typed' ? 'Original typed words. No recording was made.' : 'Original audio is not available with the current recording permission.'}</p>}
        {opened.source.objects.length > 0 && <p className="small">Connected to: {opened.source.objects.map(o => o.label).join(', ')}. <button className="btn btn-quiet" onClick={onStory}>Return to the shared place</button></p>}
      </section>}
      {sent.length > 0 && <details className="exchange-panel sent-memories"><summary>Memories you passed · {sent.length}</summary>{sent.map(c => <article key={c.id}><div><strong>{c.title}</strong><p className="small">For {c.recipientName} · {c.status === 'pending' ? 'Waiting for their choice' : c.status}</p></div>{c.status !== 'revoked' && <button className="btn btn-quiet" disabled={disabled} onClick={() => void respond(c, 'revoked')}>Revoke access</button>}</article>)}<p className="small muted">Revocation blocks future opens here. It cannot erase a recording someone has already downloaded.</p></details>}
      <section className="atlas-section"><p className="eyebrow">The world around your memory</p><h3>Explore historical references</h3><p>Look at the streets, places and details of another time. These are public archive records—not proof of anyone’s recollection.</p>
        <p className="small muted">Only the public place, years and search terms below are sent to Apify. Your stories and recordings stay private.</p>
        <form className="atlas-search" onSubmit={e => { e.preventDefault(); void perform('search', { type: 'search', input: { place, yearFrom: from, yearTo: to, terms, maxItems: 4 } }, 'Archive search complete. Review a source before adding it.'); }}>
          <label className="exchange-field">Public place<input value={place} onChange={e => setPlace(e.target.value)} minLength={2} maxLength={100} required /></label>
          <label className="exchange-field">From year<input type="number" min={1000} max={2100} value={from} onChange={e => setFrom(Number(e.target.value))} required /></label>
          <label className="exchange-field">To year<input type="number" min={from} max={2100} value={to} onChange={e => setTo(Number(e.target.value))} required /></label>
          <label className="exchange-field">Details to look for<input value={terms} onChange={e => setTerms(e.target.value)} maxLength={100} /></label>
          <button className="btn btn-primary" disabled={disabled || !['local', 'cloud'].includes(snapshot.archiveMode)}>{busy === 'search' ? 'Searching the archive…' : 'Explore references'}</button>
        </form>
        {!['local', 'cloud'].includes(snapshot.archiveMode) && <p className="notice">{snapshot.archiveMode === 'disabled-offline' ? 'Archive searches are disabled in this fixture-only room.' : 'Archive search is not configured yet. Saved references remain available.'}</p>}
        {results && <><details className="atlas-evidence"><summary>Apify run details · {results.execution === 'apify-cloud' ? 'cloud Actor' : 'local Actor'}</summary><p>Run: {results.runId}</p><pre>{JSON.stringify(results.input, null, 2)}</pre><p>{results.references.length} references · {results.retrievedAt}</p></details>
          {!results.references.length && <p className="notice">No matching references were returned. Try a wider period or different public place.</p>}
          {results.warnings.map((w, i) => <p className="small muted" key={i}>{w}</p>)}
          <div className="atlas-grid">{results.references.map(r => <ReferenceCard key={r.id} reference={r}><button className="btn btn-primary btn-wide" disabled={disabled || snapshot.references.some(saved => saved.sourceUrl === r.sourceUrl)} onClick={() => void perform(r.id, { type: 'pin', referenceId: r.id }, 'Reference added to the shared board. The memory itself has not changed.')}>{snapshot.references.some(saved => saved.sourceUrl === r.sourceUrl) ? 'Added to your board' : 'Use as a shared reference'}</button></ReferenceCard>)}</div></>}
        <h3 className="shared-board-title">Our reference board</h3><p className="small muted">Chosen together. Kept separate from your original stories and the illustrative 3D scene.</p>
        {!snapshot.references.length && <p className="exchange-empty">The board is yours to fill. Nothing is added automatically.</p>}
        <div className="atlas-grid">{snapshot.references.map(r => <ReferenceCard key={r.id} reference={r}><p className="small">Chosen by {r.contributor}</p>{r.addedBy === me && <button className="btn btn-quiet" disabled={disabled} onClick={() => void perform(r.id, { type: 'unpin', referenceId: r.id }, 'Reference removed from the board.')}>Remove reference</button>}</ReferenceCard>)}</div>
      </section>
    </>}
  </section>;
}
