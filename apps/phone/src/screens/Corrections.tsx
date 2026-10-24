import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { useLiveQuery, useRunner } from '../hooks';
import { newCommandId } from '../ids';
import { capitalize } from '../format';
import { fileUrl } from '../backend';
import { Notice, useToast } from '../ui';

type Obj = FunctionReturnType<typeof api.objects.list>[number];

export function Corrections({ code, token, revision, objects, canAct, paused }: {
  code: string; token: string; revision: number; objects: Obj[]; canAct: boolean; paused: boolean;
}) {
  const toast = useToast();
  const { busy, run } = useRunner(toast.report);
  const pending = useLiveQuery(api.corrections.list, { code, token });
  const propose = useMutation(api.corrections.propose);
  const confirm = useMutation(api.corrections.confirm);
  const reject = useMutation(api.corrections.reject);
  const [target, setTarget] = useState('');
  const [reference, setReference] = useState('');
  const [facing, setFacing] = useState('');
  const [relation, setRelation] = useState<'next_to' | 'left_of' | 'right_of'>('next_to');
  const confirmed = objects.filter(o => o.status === 'confirmed');
  const selected = target || confirmed[0]?.id || '';
  const alternatives = confirmed.filter(o => o.id !== selected);
  const beside = reference && reference !== selected ? reference : alternatives[0]?.id || '';
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected || !beside) return;
    const result = await run('preview', () => propose({
      code, token, baseRevision: revision, commandId: newCommandId(),
      objectId: selected as Id<'objects'>, referenceId: beside as Id<'objects'>, relation,
      ...(facing && facing !== selected ? { facingId: facing as Id<'objects'> } : {}),
    }));
    if (result.ok) toast.say('Preview shared. Keep it when the placement looks right.', 'ok');
  }
  return <section className="card placement-card" data-testid="corrections-panel" aria-label="Shared placements">
    <div className="section-head"><h2>Remember it together</h2><span className="chip chip-soft">Shared placement</span></div>
    <p className="muted small">Gold outlines are suggestions. The current memory stays in place until someone confirms.</p>
    {pending.problem && <Notice tone="error">{pending.problem.message}</Notice>}
    {pending.data?.map(p => <div className="placement-preview" key={p.id} data-testid="correction-preview">
      <p className="eyebrow">{p.stale ? 'Preview needs updating' : 'Ready to review'}</p>
      <h3>{p.description}</h3>
      <p className="muted small">Suggested by {p.actor}</p>
      {p.source && <blockquote className="quote" lang={p.source.language ?? undefined}>“{p.source.transcript}” <span className="muted small">— {p.source.speaker}</span></blockquote>}
      {p.source?.translation && <p className="translation"><span>In English</span> {p.source.translation}</p>}
      {p.source?.audioUrl && <audio controls src={fileUrl(p.source.audioUrl) ?? undefined} aria-label="Original placement recording" />}
      {p.stale && <p className="muted small">Another change was accepted. Dismiss this preview and create a fresh one.</p>}
      {canAct && <div className="row wrap">
        <button className="btn btn-primary" data-testid="correction-confirm" disabled={!!busy || paused || p.stale}
          onClick={() => run('keep', () => confirm({ code, token, correctionId: p.id, commandId: newCommandId() }))}>Keep this placement</button>
        <button className="btn" data-testid="correction-reject" disabled={!!busy || paused}
          onClick={() => run('dismiss', () => reject({ code, token, correctionId: p.id }))}>Dismiss preview</button>
      </div>}
    </div>)}
    <svg viewBox="-8 -10 16 14" className="placement-map" role="img" aria-label="Shared placement map" data-testid="scene-map">
      <rect x="-7.5" y="-9.5" width="15" height="13" rx=".6" fill="#f0e8d9" />
      <path d="M-7 -4H7M0 -9V3" stroke="#d8ccba" strokeDasharray=".12 .25" strokeWidth=".035" />
      {confirmed.map(o => <g key={o.id}>
        {o.pendingCorrection && <>
          <path d={`M ${o.anchor.position[0]} ${o.anchor.position[2]} L ${o.pendingCorrection.anchor.position[0]} ${o.pendingCorrection.anchor.position[2]}`}
            stroke="#a46623" strokeWidth=".06" strokeDasharray=".12 .14" />
          <g transform={`translate(${o.pendingCorrection.anchor.position[0]} ${o.pendingCorrection.anchor.position[2]})`}>
            <circle r={Math.max(.25, o.size * .3)} fill="#e9bd6a" fillOpacity=".25" stroke="#a46623" strokeWidth=".07" strokeDasharray=".13 .12" />
            <text y="-.8" textAnchor="middle" fontSize=".3" fill="#845018">Proposed {o.label}</text>
          </g>
        </>}
        <g transform={`translate(${o.anchor.position[0]} ${o.anchor.position[2]})`} data-map-id={o.id} data-x={o.anchor.position[0]} data-z={o.anchor.position[2]}>
          <circle r={Math.max(.22, Math.min(.6, o.size * .28))} fill={o.label === 'tree' ? '#667c54' : '#705442'} stroke="#fffaf0" strokeWidth=".06" />
          <text y=".95" textAnchor="middle" fontSize=".33" fill="#443b32">{capitalize(o.label)}</text>
          <path d="M0 -.15V-.62m-.1 .13L0 -.65l.1 .16" fill="none" stroke="#fdf7e9" strokeWidth=".06"
            transform={`rotate(${-(o.facingYaw ?? Math.atan2(-o.anchor.position[0]!, -o.anchor.position[2]!)) * 180 / Math.PI + 180})`} />
        </g>
      </g>)}
      <text x="0" y="2.9" textAnchor="middle" fontSize=".3" fill="#8a7a66">Entrance · left and right use this fixed map</text>
    </svg>
    {canAct && confirmed.length >= 2 && <form onSubmit={submit} className="placement-form">
      <label className="field"><span>Move</span><select data-testid="correction-object" value={selected} onChange={e => setTarget(e.target.value)}>
        {confirmed.map(o => <option key={o.id} value={o.id}>{capitalize(o.label)}</option>)}
      </select></label>
      <label className="field"><span>Relationship</span><select data-testid="correction-relation" value={relation} onChange={e => setRelation(e.target.value as typeof relation)}>
        <option value="next_to">Beside</option><option value="left_of">To the left of</option><option value="right_of">To the right of</option>
      </select></label>
      <label className="field"><span>Reference</span><select data-testid="correction-reference" value={beside} onChange={e => setReference(e.target.value)}>
        {alternatives.map(o => <option key={o.id} value={o.id}>{capitalize(o.label)}</option>)}
      </select></label>
      <label className="field"><span>Facing</span><select data-testid="correction-facing" value={facing === selected ? '' : facing} onChange={e => setFacing(e.target.value)}>
        <option value="">Keep a natural direction</option>{alternatives.map(o => <option key={o.id} value={o.id}>{capitalize(o.label)}</option>)}
      </select></label>
      <button className="btn btn-primary" type="submit" data-testid="correction-submit" disabled={!!busy || paused}>Preview placement</button>
    </form>}
    {confirmed.length < 2 && <p className="muted small">Confirm two objects to try a shared placement correction.</p>}
  </section>;
}
