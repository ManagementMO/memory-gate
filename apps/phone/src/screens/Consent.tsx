import { useState } from 'react';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Scope } from '../../../../packages/shared/src/contract';
import { timeOf } from '../format';
import { useRunner } from '../hooks';
import type { Session } from '../session';
import { Chip, Notice, useToast } from '../ui';

type RoomView = FunctionReturnType<typeof api.rooms.get>;

// The contract's scope list, kept here as data so the phone bundle doesn't pull in the extraction schema (zod).
// `satisfies` plus the Record<Scope, …> below keep it in step with packages/shared at compile time.
const SCOPES = ['photo_processing', 'voice_processing', 'voice_recording', 'vendor_upload_modal', 'vendor_upload_worldlabs', 'share_with_family'] as const satisfies readonly Scope[];
const _everyScopeListed: Exclude<Scope, (typeof SCOPES)[number]> extends never ? true : never = true;
void _everyScopeListed;

/** The plain-language notices, verbatim from CLAUDE.md (the second is Cartesia's required wording). */
export const NOTICES = [
  "You'll talk with an AI companion. Your voice is turned into text by Cartesia and the words go to Claude (Anthropic) to suggest objects. Nothing is added to the room unless someone confirms it.",
  'Conversations are recorded and may be shared with Cartesia and its third-party large language model providers.',
  "Recordings are kept only for this family's room and can be deleted at any time.",
] as const;

export const SCOPE_TEXT: Record<Scope, { title: string; plain: string }> = {
  photo_processing: { title: 'Turn the photo into a 3D room', plain: 'We use the photo you share to build the room the headset shows.' },
  voice_processing: { title: 'Talk with the companion', plain: 'Live speech goes to Cartesia to become text, and the words go to Claude (Anthropic) to suggest objects.' },
  voice_recording: { title: 'Keep the voice recordings', plain: 'Keep the original clips so the family can replay them later. Off unless you choose it. Turning it off deletes them.' },
  vendor_upload_modal: { title: 'Build the room on our GPU service', plain: 'Send the photo to Modal, our GPU provider, to build a detailed room. Without it, the sample room is used.' },
  vendor_upload_worldlabs: { title: 'Wider backdrop (World Labs)', plain: 'Send the photo to World Labs to build a wider backdrop around the room.' },
  share_with_family: { title: 'Share with family', plain: 'Family members who join with the room code can see the story and replay clips.' },
};

const DEFAULTS: Record<Scope, boolean> = {
  photo_processing: true, voice_processing: true, voice_recording: false,
  vendor_upload_modal: true, vendor_upload_worldlabs: true, share_with_family: true,
};

export function Consent({ session, view, onDone }: { session: Session; view: RoomView; onDone: () => void }) {
  const toast = useToast();
  const give = useMutation(api.consents.give);
  const revoke = useMutation(api.consents.revoke);
  const { busy, run } = useRunner(toast.report);
  const [picked, setPicked] = useState<Record<Scope, boolean>>(DEFAULTS);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const canGive = view.me.role === 'family' || view.me.role === 'storyteller';
  const active = new Set(view.consents.flatMap((c) => c.scopes));
  const mine = view.consents.filter((c) => c.givenBy === view.me.displayName);

  async function onGive() {
    const scopes = SCOPES.filter((s) => picked[s]);
    if (!scopes.length) { toast.say('Pick at least one permission, then continue.', 'error'); return; }
    const r = await run('give', () => give({ code: session.code, token: session.token, scopes: [...scopes] }));
    if (r.ok) toast.say('Thank you. Your permissions are saved.', 'ok');
  }

  async function onRevoke(id: string, scopes: string[]) {
    const r = await run(`revoke-${id}`, () => revoke({ code: session.code, token: session.token, consentId: id as Id<'consents'> }));
    setConfirmRevoke(null);
    if (r.ok) toast.say(scopes.includes('voice_recording') ? 'Revoked. Stored recordings are deleted unless someone else still allows them.' : 'Revoked.', 'ok');
  }

  return (
    <section className="screen" data-testid="consent-screen" aria-labelledby="consent-h">
      <h2 id="consent-h">Before we begin</h2>
      <p className="lede">Please read these together with the person who will use the headset.</p>
      <ul className="notices" data-testid="consent-notices">
        {NOTICES.map((n) => <li key={n}>{n}</li>)}
      </ul>

      {canGive ? (
        <div className="card">
          <h3>What may Memory Gate do?</h3>
          <p className="muted">Each one can be turned off later. Nothing is uploaded or recorded without its permission.</p>
          <ul className="scopes">
            {SCOPES.map((s) => (
              <li key={s}>
                <label className="check">
                  <input type="checkbox" data-testid={`scope-${s}`} checked={picked[s]} onChange={(e) => setPicked((p) => ({ ...p, [s]: e.target.checked }))} />
                  <span><strong>{SCOPE_TEXT[s].title}</strong><small>{SCOPE_TEXT[s].plain}</small></span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary btn-wide" data-testid="consent-submit" disabled={busy !== null} onClick={onGive}>
            {busy === 'give' ? 'Saving…' : mine.length ? 'Add these permissions' : 'I agree, save permissions'}
          </button>
        </div>
      ) : (
        <Notice tone="info" title="Only family members or the storyteller can give permissions.">
          You joined as a viewer, so you can see what was agreed but not change it.
        </Notice>
      )}

      <div className="card" data-testid="consent-given">
        <h3>Permissions given in this room</h3>
        {view.consents.length === 0 ? (
          <p className="muted" data-testid="consent-none">None yet. Until someone agrees, the room can’t use the photo or the companion.</p>
        ) : (
          <ul className="given">
            {view.consents.map((c) => {
              const canRevoke = view.me.isOwner || c.givenBy === view.me.displayName;
              return (
                <li key={c.id} data-testid="consent-row">
                  <p><strong>{c.givenBy}</strong> <span className="muted">· {timeOf(c.createdAt)}</span></p>
                  <div className="chips">{c.scopes.map((s) => <Chip key={s} kind="scope">{SCOPE_TEXT[s as Scope]?.title ?? s}</Chip>)}</div>
                  {canRevoke && (confirmRevoke === c.id ? (
                    <div className="row">
                      <button type="button" className="btn btn-danger" data-testid="consent-revoke-confirm" disabled={busy !== null} onClick={() => onRevoke(c.id, c.scopes)}>
                        Yes, revoke
                      </button>
                      <button type="button" className="btn" onClick={() => setConfirmRevoke(null)}>Keep</button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-quiet" data-testid="consent-revoke" onClick={() => setConfirmRevoke(c.id)}>Revoke</button>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
        {active.size > 0 && !active.has('voice_recording') && (
          <p className="muted small">Voice recordings are off: lines are shown as text, and no clips are kept.</p>
        )}
      </div>

      <button type="button" className="btn btn-wide" data-testid="consent-continue" onClick={onDone} disabled={view.consents.length === 0 && canGive}>
        Continue
      </button>
    </section>
  );
}
