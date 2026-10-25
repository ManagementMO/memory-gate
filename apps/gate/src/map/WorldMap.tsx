// The flat world map with a pin wherever there are memories to open. San Francisco is where you are (a slow halo);
// a place you aren't in wears a "?" instead of a count. Under the map, the same places as large rows: easier to
// tap, and what a screen reader and the keyboard use (the pins themselves are for pointing at).
import { HERE, PLACES, type PlaceId } from './state';
import { LAND, MAP } from './land';
import { toMap } from './project';

export type Pin = { place: PlaceId; count: number; locked: boolean };

/** Which side of its pin a place's name sits on, toward open ocean (San Francisco's would cover New York's). */
const SIDE: Record<PlaceId, 'left' | 'right'> = { sf: 'left', ny: 'right' };
const memoriesLine = (n: number) => `${n} ${n === 1 ? 'memory' : 'memories'}`;

export function WorldMap({ pins, onOpen }: { pins: Pin[]; onOpen: (place: PlaceId) => void }) {
  const here = toMap(PLACES[HERE].lat, PLACES[HERE].lng);
  return (
    <div className="worldmap">
      <div className="worldmap-frame glass">
        <div className="worldmap-box" style={{ aspectRatio: `${MAP.width} / ${MAP.height}` }}>
          <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`} aria-hidden="true" focusable="false">
            <path className="worldmap-land" d={LAND} />
          </svg>
          <span className="worldmap-here" style={{ left: `${here.x}%`, top: `${here.y}%` }} aria-hidden="true" />
          {pins.map((p) => {
            const at = toMap(PLACES[p.place].lat, PLACES[p.place].lng);
            return (
              <button key={p.place} type="button" className="worldmap-pin" data-locked={p.locked} data-side={SIDE[p.place]} style={{ left: `${at.x}%`, top: `${at.y}%` }}
                onClick={() => onOpen(p.place)} tabIndex={-1} aria-hidden="true" data-testid={`map-pin-${p.place}`}>
                <span className="worldmap-pin-head">{p.locked ? '?' : p.count}</span>
                <span className="worldmap-pin-label">{PLACES[p.place].name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <ul className="worldmap-places">
        {pins.map((p) => (
          <li key={p.place}>
            <button type="button" className="worldmap-place glass" data-locked={p.locked} onClick={() => onOpen(p.place)} data-testid={`map-place-${p.place}`}>
              <span className="worldmap-place-mark" aria-hidden="true">{p.locked ? '?' : p.count}</span>
              <span className="worldmap-place-text">
                <strong>{PLACES[p.place].name}</strong>
                <small>{memoriesLine(p.count)}{p.locked ? ' · open them when you’re there' : p.place === HERE ? ' · you are here' : ''}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
