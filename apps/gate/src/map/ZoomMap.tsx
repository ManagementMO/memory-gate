// Zoom mode: the memory map filling the screen, to look closer. Pinch or scroll to zoom toward your fingers or the
// pointer, drag to move, double-tap to zoom in there, or use + and −; the keyboard has + − 0 and the arrows. Pins
// keep their size and open their place as on the small map. Done or Escape goes back.
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { GlobeIcon, MinusIcon, PlusIcon } from '../ui/Icons';
import { LAND } from './land';
import { toMapUnits } from './project';
import { HERE, LABEL_SIDE, PLACES, type Pin, type PlaceId } from './state';
import { clampView, MAX_ZOOM, MIN_ZOOM, panBy, toScreen, toUnits, unitsPerPx, viewBox, WORLD, zoomAt, type Point, type Size, type View } from './view';

const STEP = 2; // each + or − doubles or halves the zoom
const OPEN_ZOOM = 3; // tapping the small map opens zoom mode this close to where you tapped
const TAP_SLOP = 8; // px a finger may wander and still be a tap
const DOUBLE_TAP_MS = 320;
const LABEL_W = 170; // room a place's name needs beside its pin
const TWEEN_MS = 450;

type Gesture = { start: Point; moved: boolean; pinch?: { d0: number; k0: number; anchor: Point } };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const ease = (a: number) => (a < 0.5 ? 4 * a * a * a : 1 - (-2 * a + 2) ** 3 / 2);
const memoriesLine = (n: number) => `${n} ${n === 1 ? 'memory' : 'memories'}`;

export function ZoomMap({ title, pins, focus, onOpen, onClose }: {
  title: string; pins: Pin[]; focus: Point | null; onOpen: (place: PlaceId) => void; onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<View>(WORLD);
  const sizeRef = useRef<Size>({ w: 1, h: 1 });
  const viewRef = useRef<View>(WORLD);
  const set = useCallback((v: View) => { viewRef.current = v; setView(v); }, []);

  const tween = useRef(0);
  const stopTween = () => cancelAnimationFrame(tween.current);
  const animateTo = useCallback((target: View) => {
    cancelAnimationFrame(tween.current);
    if (reduce) { set(target); return; }
    const from = viewRef.current, t0 = performance.now();
    const step = (t: number) => {
      const a = Math.min(1, (t - t0) / TWEEN_MS), e = ease(a);
      // zoom geometrically, so each doubling takes the same time
      set(clampView({ cx: from.cx + (target.cx - from.cx) * e, cy: from.cy + (target.cy - from.cy) * e, k: from.k * (target.k / from.k) ** e }, sizeRef.current));
      if (a < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  }, [reduce, set]);
  useEffect(() => () => cancelAnimationFrame(tween.current), []);

  // Measure the stage, and keep the view inside the world whenever it changes size.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      sizeRef.current = { w: r.width, h: r.height };
      setSize(sizeRef.current);
      set(clampView(viewRef.current, sizeRef.current));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [set]);
  // The first look: glide in toward where the small map was tapped (once it's measured; again if interrupted).
  const ready = size !== null;
  useEffect(() => {
    if (!ready || !focus) return;
    animateTo(clampView({ cx: focus.x, cy: focus.y, k: OPEN_ZOOM }, sizeRef.current));
    return () => cancelAnimationFrame(tween.current);
  }, [ready, focus, animateTo]);

  // Scroll or trackpad-pinch to zoom toward the pointer. (Not passive: the page must not scroll instead.)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(tween.current);
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      set(zoomAt(viewRef.current, sizeRef.current, viewRef.current.k * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0022)), { x: e.clientX - r.left, y: e.clientY - r.top }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [set]);

  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  useEffect(() => { stage.current?.focus({ preventScroll: true }); }, []);

  // Drag with one finger or the mouse; pinch with two; two quick taps zoom in where you tapped.
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ t: number; p: Point } | null>(null);
  const local = (e: PointerEvent) => { const r = stage.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const startPinch = () => {
    const [a, b] = [...pointers.current.values()] as [Point, Point];
    gesture.current = { start: mid(a, b), moved: true, pinch: { d0: Math.max(1, dist(a, b)), k0: viewRef.current.k, anchor: toUnits(viewRef.current, sizeRef.current, mid(a, b)) } };
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('.worldmap-pin')) return;
    stopTween();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = { start: local(e), moved: false };
    else if (pointers.current.size === 2) startPinch();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId), g = gesture.current;
    if (!prev || !g) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (g.pinch && pointers.current.size >= 2) {
      // Keep the map point that was between the fingers between them, at the zoom their spread asks for.
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      const m = mid(a, b), s = sizeRef.current;
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.pinch.k0 * (dist(a, b) / g.pinch.d0)));
      const u = unitsPerPx({ ...viewRef.current, k }, s);
      set(clampView({ cx: g.pinch.anchor.x - m.x * u + (s.w * u) / 2, cy: g.pinch.anchor.y - m.y * u + (s.h * u) / 2, k }, s));
    } else if (pointers.current.size === 1) {
      if (!g.moved && dist(p, g.start) > TAP_SLOP) g.moved = true;
      if (g.moved) set(panBy(viewRef.current, sizeRef.current, p.x - prev.x, p.y - prev.y));
    }
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (pointers.current.size === 1) { gesture.current = { start: [...pointers.current.values()][0]!, moved: true }; return; } // one finger lifted: keep dragging
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved || e.type !== 'pointerup') return;
    const p = local(e), now = performance.now(), last = lastTap.current;
    if (last && now - last.t < DOUBLE_TAP_MS && dist(p, last.p) < 30) {
      lastTap.current = null;
      animateTo(zoomAt(viewRef.current, sizeRef.current, viewRef.current.k * STEP, p));
    } else lastTap.current = { t: now, p };
  };

  const centre = () => ({ x: sizeRef.current.w / 2, y: sizeRef.current.h / 2 });
  const zoomBy = (f: number) => animateTo(zoomAt(viewRef.current, sizeRef.current, viewRef.current.k * f, centre()));
  const world = () => animateTo(clampView(WORLD, sizeRef.current));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = sizeRef.current, v = viewRef.current;
    const moves: Record<string, [number, number]> = { ArrowLeft: [s.w * 0.2, 0], ArrowRight: [-s.w * 0.2, 0], ArrowUp: [0, s.h * 0.2], ArrowDown: [0, -s.h * 0.2] };
    if (e.key === '+' || e.key === '=') zoomBy(STEP);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / STEP);
    else if (e.key === '0') world();
    else if (moves[e.key]) animateTo(panBy(v, s, ...moves[e.key]!));
    else return;
    e.preventDefault();
  };

  // Tab stays inside zoom mode while it's open.
  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  const box = size ? viewBox(view, size) : null;
  const placed = size ? pins.map((p) => ({ p, at: toScreen(view, size, toMapUnits(PLACES[p.place].lat, PLACES[p.place].lng)) }))
    .filter(({ at }) => at.x > -60 && at.x < size.w + 60 && at.y > -10 && at.y < size.h + 70) : [];
  const here = size ? toScreen(view, size, toMapUnits(PLACES[HERE].lat, PLACES[HERE].lng)) : null;
  return createPortal(
    <motion.div className="zoommap" role="dialog" aria-modal="true" aria-label={`${title}: the map, zoomed`} onKeyDown={trap} data-testid="map-zoomed"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <div className="zoommap-top">
        <p className="zoommap-title">{title}</p>
        <button type="button" className="pill glass zoommap-done" onClick={onClose} data-testid="map-zoom-done">Done</button>
      </div>
      <div className="zoommap-body">
        <div ref={stage} className="zoommap-stage" tabIndex={0} data-testid="map-zoom-stage" data-zoom={view.k.toFixed(2)}
          aria-label="World map. Plus and minus zoom, the arrow keys move, 0 shows the whole world."
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onKeyDown}>
          {box && (
            <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} aria-hidden="true" focusable="false">
              <path className="worldmap-land" d={LAND} />
            </svg>
          )}
          {here && <span className="worldmap-here" style={{ left: here.x, top: here.y }} aria-hidden="true" />}
          {placed.map(({ p, at }) => {
            // A name goes toward the open side, and steps aside when another pin is close enough to cover it.
            let side = LABEL_SIDE[p.place];
            if (side === 'left' && at.x < LABEL_W) side = 'right';
            else if (side === 'right' && size && at.x > size.w - LABEL_W) side = 'left';
            const crowded = placed.some((o) => o.p !== p && Math.abs(o.at.x - at.x) < LABEL_W && Math.abs(o.at.y - at.y) < 46);
            return (
              <button key={p.place} type="button" className="worldmap-pin" data-locked={p.locked} data-side={side} data-label={crowded ? 'hidden' : 'shown'}
                style={{ left: at.x, top: at.y }} onClick={() => onOpen(p.place)} data-testid={`zoom-pin-${p.place}`}
                aria-label={`${PLACES[p.place].name}, ${memoriesLine(p.count)}${p.locked ? ' you can open when you’re there' : ''}`}>
                <span className="worldmap-pin-head" aria-hidden="true">{p.locked ? '?' : p.count}</span>
                <span className="worldmap-pin-label" aria-hidden="true">{PLACES[p.place].name}</span>
              </button>
            );
          })}
        </div>
        <div className="zoommap-controls glass" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomBy(STEP)} disabled={view.k >= MAX_ZOOM - 1e-3} aria-label="Zoom in" data-testid="map-zoom-in"><PlusIcon /></button>
          <button type="button" onClick={() => zoomBy(1 / STEP)} disabled={view.k <= MIN_ZOOM + 1e-3} aria-label="Zoom out" data-testid="map-zoom-out"><MinusIcon /></button>
          <button type="button" onClick={world} disabled={view.k <= MIN_ZOOM + 1e-3} aria-label="Show the whole world" data-testid="map-zoom-world"><GlobeIcon /></button>
        </div>
        <p className="zoommap-hint" aria-hidden="true">
          <span className="for-mouse">Scroll to zoom · drag to move</span>
          <span className="for-touch">Pinch to zoom · drag to move</span>
        </p>
      </div>
    </motion.div>,
    document.body,
  );
}
