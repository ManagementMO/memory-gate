// The flat world map with a pin wherever there are memories to open. San Francisco is where you are (a slow halo);
// a place you aren't in wears a "?" instead of a count. Under the map, the same places as large rows: easier to
// tap, and what a screen reader and the keyboard use (the pins themselves are for pointing at). Zoom, or a tap on
// the map itself, opens zoom mode (ZoomMap.tsx) to look closer.
import { AnimatePresence } from 'motion/react';
import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { ZoomIcon } from '../ui/Icons';
import { LAND, MAP } from './land';
import { toMap } from './project';
import { HERE, LABEL_SIDE, PLACES, type Pin, type PlaceId } from './state';
import type { Point } from './view';
import { ZoomMap } from './ZoomMap';

const memoriesLine = (n: number) => `${n} ${n === 1 ? 'memory' : 'memories'}`;

export function WorldMap({ title, pins, onOpen }: { title: string; pins: Pin[]; onOpen: (place: PlaceId) => void }) {
  const here = toMap(PLACES[HERE].lat, PLACES[HERE].lng);
  const [zoom, setZoom] = useState<{ focus: Point | null } | null>(null);
  const zoomButton = useRef<HTMLButtonElement>(null);
  const closeZoom = useCallback(() => { setZoom(null); zoomButton.current?.focus({ preventScroll: true }); }, []);
  /** A tap on the map (not on a pin) zooms in toward that spot. */
  const zoomToward = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('.worldmap-pin')) return;
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ focus: { x: ((e.clientX - r.left) / r.width) * MAP.width, y: ((e.clientY - r.top) / r.height) * MAP.height } });
  };
  return (
    <div className="worldmap">
      <div className="worldmap-frame glass">
        <button ref={zoomButton} type="button" className="pill glass worldmap-zoom" onClick={() => setZoom({ focus: null })} data-testid="map-zoom">
          <ZoomIcon /> Zoom
        </button>
        <div className="worldmap-box" style={{ aspectRatio: `${MAP.width} / ${MAP.height}` }} onClick={zoomToward} data-testid="map-box">
          <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`} aria-hidden="true" focusable="false">
            <path className="worldmap-land" d={LAND} />
          </svg>
          <span className="worldmap-here" style={{ left: `${here.x}%`, top: `${here.y}%` }} aria-hidden="true" />
          {pins.map((p) => {
            const at = toMap(PLACES[p.place].lat, PLACES[p.place].lng);
            return (
              <button key={p.place} type="button" className="worldmap-pin" data-locked={p.locked} data-side={LABEL_SIDE[p.place]} style={{ left: `${at.x}%`, top: `${at.y}%` }}
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
      <AnimatePresence>
        {zoom && <ZoomMap key="zoom" title={title} pins={pins} focus={zoom.focus} onOpen={onOpen} onClose={closeZoom} />}
      </AnimatePresence>
    </div>
  );
}
