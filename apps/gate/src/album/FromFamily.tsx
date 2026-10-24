// Two more rows of the album, from the team's memory exchange. "From family": memories someone passed to this person,
// in their own words; keep one, then open it whenever you like and hear it again. "From the archive": historical
// photos the family pinned for context. Each row appears only when it has something in it (and only while the
// exchange is running), so the album never shows empty shelves.
import { useEffect, useRef, useState } from 'react';
import type { Session } from '../state/store';
import { useExchange, type Capsule } from './exchange';

function MemoryCard({ capsule, opened, onKeep, onLater, onOpen }: {
  capsule: Capsule;
  opened: { transcript: string; audioUrl: string | null } | null;
  onKeep?: () => void; onLater?: () => void; onOpen?: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => audio.current?.pause(), []);
  const pending = capsule.status === 'pending';
  return (
    <li className="xcard pane" data-testid={pending ? 'family-incoming' : 'family-kept'}>
      <p className="xcard-from">From {capsule.senderName}</p>
      <h3>{capsule.title}</h3>
      {opened ? (
        <>
          <blockquote>“{opened.transcript}”</blockquote>
          {opened.audioUrl && (
            <button type="button" className="pill glass xcard-play" onClick={() => {
              const a = audio.current; if (!a) return;
              if (a.paused) { void a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
            }}>{playing ? 'Pause' : 'Hear it in their voice'}</button>
          )}
          {opened.audioUrl && <audio ref={audio} src={opened.audioUrl} onEnded={() => setPlaying(false)} preload="none" />}
        </>
      ) : pending ? (
        <div className="xcard-actions">
          <button type="button" className="pill glass" onClick={onKeep} data-testid="family-keep">Keep it</button>
          <button type="button" className="quiet-link" onClick={onLater}>Not now</button>
        </div>
      ) : (
        <div className="xcard-actions">
          <button type="button" className="pill glass" onClick={onOpen} disabled={!capsule.sourceAvailable} data-testid="family-open">Open</button>
        </div>
      )}
    </li>
  );
}

export function FromFamily({ session }: { session: Session | null }) {
  const { snapshot, opened, status, request } = useExchange(session);
  if (status !== 'connected' || !snapshot) return null;
  const me = snapshot.context.memberId;
  const incoming = snapshot.capsules.filter((c) => c.recipientId === me && c.status === 'pending');
  const kept = snapshot.capsules.filter((c) => c.recipientId === me && c.status === 'accepted');
  const refs = snapshot.references;
  const act = (m: Record<string, unknown>) => { void request(m).catch((e) => console.warn('[exchange]', e)); };
  return (
    <>
      {(incoming.length > 0 || kept.length > 0) && (
        <section className="memory exchange-row" aria-labelledby="from-family" data-testid="from-family">
          <header className="memory-head">
            <h2 id="from-family">From family</h2>
            <p>Memories passed to you, in their own words.</p>
          </header>
          <ul className="xcards">
            {incoming.map((c) => (
              <MemoryCard key={c.id} capsule={c} opened={null}
                onKeep={() => act({ type: 'respond', capsuleId: c.id, revision: c.revision, status: 'accepted' })}
                onLater={() => act({ type: 'respond', capsuleId: c.id, revision: c.revision, status: 'dismissed' })} />
            ))}
            {kept.map((c) => (
              <MemoryCard key={c.id} capsule={c} opened={opened?.capsuleId === c.id ? opened.source : null}
                onOpen={() => act({ type: 'open', capsuleId: c.id })} />
            ))}
          </ul>
        </section>
      )}
      {refs.length > 0 && (
        <section className="memory exchange-row" aria-labelledby="from-archive" data-testid="from-archive">
          <header className="memory-head">
            <h2 id="from-archive">From the archive</h2>
            <p>Places and times your family pinned, for context.</p>
          </header>
          <ul className="xcards">
            {refs.map((r) => (
              <li key={r.id} className="xcard pane archive">
                {r.imageUrl && <img loading="lazy" referrerPolicy="no-referrer" src={r.imageUrl} alt={r.title} />}
                <p className="xcard-from">{r.publisher}, {r.date}</p>
                <h3>{r.title}</h3>
                <a className="quiet-link" href={r.sourceUrl} target="_blank" rel="noreferrer">See the record</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
