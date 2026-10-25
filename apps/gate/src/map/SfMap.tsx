// World memories in San Francisco, on the city itself: a pin at each place where people shared a memory (the Golden
// Gate Bridge, the Palace of Fine Arts, Alamo Square...), showing its photograph. A pin opens a card with the photos
// and the words; Enter steps into the memory through its owner's eyes. At the Golden Gate Bridge, Enter takes you
// there as yourself, among everyone who kept a memory of it. The samples are fictional and say so.
import { useEffect, useMemo, useState } from 'react';
import { GOLDEN_GATE_CROWD, SF_MEMORIES, SF_PLACES, type SfMemory } from '../sf/memories';
import { PROPOSAL } from '../world-memory/story';
import { openPrepared } from '../album/prepared';
import { CloseIcon } from '../ui/Icons';
import { SF_BOX, SF_BRIDGE, SF_K, SF_LAND, SF_LAT0, SF_PARKS } from './sfLand';

const COS = Math.cos((SF_LAT0 * Math.PI) / 180);
const proj = (lat: number, lng: number): [number, number] => [(lng - SF_BOX.west) * COS * SF_K, (SF_BOX.north - lat) * SF_K];
// The northern half of the city, where the memories are: the Golden Gate, the Presidio, the Marina, downtown.
const [VX0, VY0] = proj(37.8345, -122.515);
const [VX1, VY1] = proj(37.7535, -122.392);
const VIEW = { x: VX0, y: VY0, w: VX1 - VX0, h: VY1 - VY0 };
const pct = (lat: number, lng: number) => { const [x, y] = proj(lat, lng); return { left: `${((x - VIEW.x) / VIEW.w) * 100}%`, top: `${((y - VIEW.y) / VIEW.h) * 100}%` }; };
const thumb = (photo: string) => photo.replace('/memories/sf/', '/memories/sf/thumbs/').replace(/\.\w+$/, '.jpg');

type Spot = { id: string; name: string; lat: number; lng: number; memories: SfMemory[]; crowd: boolean; story?: true };

export function SfMap({ onBack, onAlbums, onClose, onVisit }: { onBack: () => void; onAlbums: () => void; onClose?: () => void; onVisit: (id: string) => void }) {
  const spots = useMemo<Spot[]>(() => {
    const byPlace = new Map<string, SfMemory[]>();
    for (const m of SF_MEMORIES) byPlace.set(m.place, [...(byPlace.get(m.place) ?? []), m]);
    const list: Spot[] = [...byPlace].map(([id, ms]) => ({ id, name: SF_PLACES[id]!.name, lat: SF_PLACES[id]!.lat, lng: SF_PLACES[id]!.lng, memories: ms, crowd: id === 'golden_gate' }));
    // The Golden Gate gathers everyone whose photo holds the bridge (Baker Beach's too).
    const gg = list.find((s) => s.crowd);
    if (gg) gg.memories = SF_MEMORIES.filter((m) => m.crowd);
    return list;
  }, []);
  const [open, setOpen] = useState<Spot | null>(null);
  const [pick, setPick] = useState(0);
  const primary = () => {
    if (!open) return;
    if (open.story) { openPrepared({ id: 'world:proposal', title: PROPOSAL.title, at: 0, source: 'words', palette: [], sample: true, about: PROPOSAL.about, open: { href: PROPOSAL.href }, moments: [] }, undefined, 'world'); return; }
    onVisit(open.crowd ? GOLDEN_GATE_CROWD.id : open.memories[pick]!.id);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(null); }
      if (e.key === 'Enter' && open && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); primary(); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const [b0, b1] = SF_BRIDGE;
  const kite = { lat: 37.7586, lng: -122.4405 };
  return (
    <section className="album atlas sfmap" aria-labelledby="sfmap-h" data-testid="sf-map">
      <div className="album-scrim" aria-hidden="true" />
      <div className="sfmap-top">
        <button type="button" className="pill glass" onClick={onBack} data-testid="sf-map-back">Map</button>
        <div className="sfmap-title">
          <h1 id="sfmap-h">San Francisco</h1>
          <p>Memories people shared here. Open a pin, then press Enter to step in.</p>
        </div>
        <button type="button" className="pill glass" onClick={onAlbums} data-testid="sf-map-albums">Albums</button>
        {onClose && <button type="button" className="icon-btn glass" aria-label="Back to the start" onClick={onClose}><CloseIcon /></button>}
      </div>
      <div className="sfmap-frame">
        <svg className="sfmap-svg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect x={VIEW.x - 50} y={VIEW.y - 50} width={VIEW.w + 100} height={VIEW.h + 100} className="sfmap-water" />
          <g className="sfmap-land">{SF_LAND.map((d, i) => <path key={i} d={d} />)}</g>
          <g className="sfmap-parks">{SF_PARKS.map((d, i) => <path key={i} d={d} />)}</g>
          <line className="sfmap-bridge" x1={b0[0]} y1={b0[1]} x2={b1[0]} y2={b1[1]} />
          {SF_MEMORIES.filter((m) => m.crowd).map((m) => { const [x, y] = proj(m.lat, m.lng); return <circle key={m.id} className="sfmap-dot" cx={x} cy={y} r={2.2} />; })}
        </svg>
        {spots.map((s) => (
          <button key={s.id} type="button" className={`sfmap-pin${s.crowd ? ' crowd' : ''}${open?.id === s.id ? ' on' : ''}`} style={pct(s.lat, s.lng)}
            onClick={() => { setOpen(s); setPick(0); }} aria-label={`${s.name}: ${s.memories.length} ${s.memories.length === 1 ? 'memory' : 'memories'}`} data-testid={`sf-pin-${s.id}`}>
            <span className="sfmap-stack">
              {s.memories.slice(0, s.crowd ? 3 : 2).map((m, i) => <img key={m.id} src={thumb(m.photo)} alt="" style={{ '--i': i } as React.CSSProperties} />)}
            </span>
            <span className="sfmap-label">{s.name}{s.memories.length > 1 ? ` · ${s.memories.length}` : ''}</span>
          </button>
        ))}
        <button type="button" className={`sfmap-pin${open?.story ? ' on' : ''}`} style={pct(kite.lat, kite.lng)} data-testid="sf-pin-proposal"
          onClick={() => setOpen({ id: 'proposal', name: 'Kite Hill', lat: kite.lat, lng: kite.lng, memories: [], crowd: false, story: true })} aria-label={`${PROPOSAL.title}, ${PROPOSAL.owners}`}>
          <span className="sfmap-stack"><img src={PROPOSAL.words[0]!.image} alt="" /></span>
          <span className="sfmap-label">{PROPOSAL.title}</span>
        </button>
        <p className="sfmap-credit">Map: DataSF. Every memory here is a fictional sample made for this demonstration.</p>
      </div>
      {open && (
        <aside className="sfmap-card glass" role="dialog" aria-label={open.name} data-testid="sf-card">
          <button type="button" className="icon-btn sfmap-card-close" aria-label="Close" onClick={() => setOpen(null)}><CloseIcon /></button>
          {open.story ? (
            <>
              <img className="sfmap-photo" src={PROPOSAL.words[0]!.image} alt="" />
              <h2>{PROPOSAL.title}</h2>
              <p className="sfmap-who">{PROPOSAL.owners}</p>
              {PROPOSAL.words.map((w, i) => <p key={i} className="sfmap-words">“{w.quote}” <span>{w.who}</span></p>)}
            </>
          ) : open.crowd ? (
            <>
              <div className="sfmap-collage">{open.memories.slice(0, 6).map((m) => <img key={m.id} src={thumb(m.photo)} alt="" />)}</div>
              <h2>{open.name}</h2>
              <p className="sfmap-who">{open.memories.length} people kept a memory here</p>
              <p className="sfmap-words">Go there as yourself and walk among them. Each one holds their picture; point at anyone to step into their memory.</p>
              <ul className="sfmap-list">
                {open.memories.map((m) => (
                  <li key={m.id}><button type="button" onClick={() => onVisit(m.id)} data-testid={`sf-open-${m.id}`}><img src={thumb(m.photo)} alt="" /><span><b>{m.title}</b><i>{m.owner} · {m.when}</i></span></button></li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <img className="sfmap-photo" src={open.memories[pick]!.photo} alt="" />
              <h2>{open.memories[pick]!.title}</h2>
              <p className="sfmap-who">{open.memories[pick]!.owner} · {open.name} · {open.memories[pick]!.when}</p>
              {open.memories[pick]!.words.map((w, i) => <p key={i} className="sfmap-words">{w}</p>)}
              {open.memories.length > 1 && (
                <div className="sfmap-more">{open.memories.map((m, i) => <button key={m.id} type="button" className={i === pick ? 'on' : ''} onClick={() => setPick(i)} aria-label={m.title}><img src={thumb(m.photo)} alt="" /></button>)}</div>
              )}
            </>
          )}
          <button key={`${open.id}:${pick}`} type="button" className="pill big sfmap-enter" onClick={primary} data-testid="sf-enter" autoFocus>
            {open.crowd ? 'Go to the bridge' : 'Step into this memory'} <kbd>Enter</kbd>
          </button>
        </aside>
      )}
    </section>
  );
}
