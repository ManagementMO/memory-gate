// Start from a social post: paste a link to a public Instagram post, and its photo starts the memory exactly as a photo
// chosen with Photo does (the companion looks at it, and the place forms from it). The post is retrieved by the team's
// Apify import (convex/memoryImport.ts) and nothing is shared until a photo is chosen here. A clearly labelled
// fictional example works without an Apify token, for trying it out.
import { useAction, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { fileUrl } from '../backend/client';
import { flow } from '../flow/controller';
import { sourceError } from '../memory-objects/errors';
import { useImportProgress } from '../red-kite/SourceLibrary';
import { useGate } from '../state/store';
import { CloseIcon } from './Icons';

const useSocialPost = create<{ open: boolean }>(() => ({ open: false }));
export const openSocialPost = () => useSocialPost.setState({ open: true });
const close = () => useSocialPost.setState({ open: false });

/** The example: our own illustration of the Red Kite, labelled as fictional wherever it's shown. */
const EXAMPLE = { image: '/memories/red-kite/2-red-kite.jpg', owner: 'Fictional example', caption: 'Our red kite over the meadow, the cream ribbon on its tail.' };
const POST_URL = /^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?/i;

/** Hand a picture to the visit as if it had been chosen with Photo. */
async function startFrom(url: string, name: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('That photo could not be opened. Try another public post.');
  const blob = await response.blob();
  close();
  await flow.receiveFile(new File([blob], name, { type: blob.type || 'image/jpeg' }));
}

export function SocialPostSheet() {
  const open = useSocialPost((s) => s.open);
  const stage = useGate((s) => s.stage);
  useEffect(() => { if (stage !== 'gathering') close(); }, [stage]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet glass social-sheet" role="dialog" aria-modal="true" aria-labelledby="social-h" onClick={(e) => e.stopPropagation()} data-testid="social-sheet">
        <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={close}><CloseIcon /></button>
        <h2 id="social-h">Start from a social post</h2>
        <p>Paste a link to a public Instagram post. Its photo starts the memory, just like a photo you choose.</p>
        <LiveImport />
        <Example />
      </section>
    </div>
  );
}

function LiveImport() {
  const session = useGate((s) => s.session);
  const auth = session ? { code: session.code, token: session.token } : null;
  const library = useQuery(api.memorySources.list, auth ?? 'skip');
  useImportProgress(auth, library);
  const start = useAction(api.memoryImport.start), photoForVisit = useAction(api.memoryImport.photoForVisit);
  const [link, setLink] = useState(''), [permission, setPermission] = useState(false);
  const [job, setJob] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');

  const run = library?.jobs.find((j) => j._id === job);
  const photos = (library?.sources ?? []).filter((s) => s.importId === job && s.execution !== 'fixture' && s.imageUrl);
  const unavailable = !auth ? 'Live posts need this computer’s Memora server, which isn’t reachable right now.'
    : library?.offline ? 'This is an offline practice room, so live posts are switched off. The example below still works.'
      : library && !library.configured ? 'Live posts need this server’s Apify setup. The example below works now.' : '';

  const fetchPost = async () => {
    if (!auth) return;
    setBusy(true); setError('');
    try { setJob(await start({ ...auth, mode: 'cloud', urls: [link.trim()], permission })); }
    catch (e) { setError(sourceError(e)); }
    finally { setBusy(false); }
  };
  const use = async (id: Id<'memorySources'>) => {
    if (!auth) return;
    setBusy(true); setError('');
    try { await startFrom(fileUrl(await photoForVisit({ ...auth, id })) ?? '', 'social-post.jpg'); }
    catch (e) { setError(sourceError(e)); setBusy(false); }
  };

  return (
    <div className="social-live">
      <label className="social-field">
        <span className="visually-hidden">Public Instagram post link</span>
        <input type="url" inputMode="url" placeholder="https://www.instagram.com/p/…" value={link} maxLength={300}
          onChange={(e) => setLink(e.target.value)} disabled={!!unavailable || busy} data-testid="social-link" />
      </label>
      <label className="social-check">
        <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} disabled={!!unavailable} data-testid="social-permission" />
        <span>This post is public, and our family is happy to use it here.</span>
      </label>
      <button type="button" className="pill glass social-go" onClick={() => void fetchPost()}
        disabled={!!unavailable || busy || !permission || !POST_URL.test(link.trim()) || run?.status === 'running'} data-testid="social-fetch">
        {run?.status === 'running' ? 'Getting the photo…' : 'Get the photo'}
      </button>
      {unavailable && <p className="social-note" data-testid="social-unavailable">{unavailable}</p>}
      {run?.status === 'failed' && <p className="social-note" role="alert">{run.error ?? 'That post couldn’t be retrieved.'}</p>}
      {error && <p className="social-note" role="alert">{error}</p>}
      {photos.length > 0 && (
        <ul className="social-photos" aria-label="Photos from the post">
          {photos.map((s) => (
            <li key={s._id}>
              <button type="button" onClick={() => void use(s._id)} disabled={busy} data-testid="social-photo">
                <img src={s.imageUrl ?? ''} alt={s.caption ? `Photo: ${s.caption.slice(0, 80)}` : 'Photo from the post'} referrerPolicy="no-referrer" />
                <span>{s.owner}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Example() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const use = async () => {
    setBusy(true); setError('');
    try { await startFrom(EXAMPLE.image, 'example-post.jpg'); }
    catch (e) { setError(e instanceof Error ? e.message : 'The example couldn’t open.'); setBusy(false); }
  };
  return (
    <div className="social-example">
      <p className="social-or">Or try a fictional example post</p>
      <button type="button" className="social-post" onClick={() => void use()} disabled={busy} data-testid="social-example">
        <img src={EXAMPLE.image} alt="" />
        <span className="social-post-text"><strong>{EXAMPLE.owner}</strong>{EXAMPLE.caption}<small>Not a real post · our own illustration</small></span>
      </button>
      {error && <p className="social-note" role="alert">{error}</p>}
    </div>
  );
}
