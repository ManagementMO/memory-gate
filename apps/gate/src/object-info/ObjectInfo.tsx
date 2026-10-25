/** An additive object HUD. It observes existing objects; it never moves them, the camera, or the XR origin. */
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useAction, useQuery } from 'convex/react';
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { api } from '../../../../convex/_generated/api';
import { objectTopic, type ObjectReference } from '../../../../actors/historical-memory-atlas/src/knowledge.mjs';
import { useGate } from '../state/store';
import { useMemory } from '../flow/memory';
import { memoryKey } from '../social/perspectives';
import { useSocial, viewingPerspective } from '../social/store';
import { useObjectWorkshop } from '../memory-objects/workshop';
import { formation } from '../scene/sketch/SketchObject';
import { xrStore } from '../scene/xr';
import { convex } from '../backend/client';
import { closeObjectInfo, infoButtons, loadSaved, referencesFor, useInspired, useObjectInfo, type InfoTarget } from './state';
import { buildInfoTargets } from './targets';
import { serverNow, usePresence } from '../presence/presence';
import './object-info.css';
const enabled = new URLSearchParams(location.search).get('objectInfo') !== 'off';

/** An unavailable optional backend/asset must never take down the memory or the companion. */
class InfoBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.warn('[object-info] Optional references are unavailable. The memory continues.'); }
  render() { return this.state.failed ? null : this.props.children; }
}

function useInfoContext() {
  const session = useGate(s => s.session), stage = useGate(s => s.stage), paused = useGate(s => s.resting), xr = useGate(s => s.xr);
  const viewing = useSocial(s => s.viewing), openStory = useSocial(s => s.openStory);
  const workshop = useObjectWorkshop(s => s.open || s.photos || !!s.selected);
  const selected = useObjectInfo(s => s.selected), targets = useObjectInfo(s => s.targets);
  const auth = session ? { code: session.code, token: session.token } : null;
  const library = useQuery(api.objectKnowledge.list, auth ?? 'skip');
  const target = targets.find(t => t.id === selected) ?? null;
  const job = library?.jobs.find(j => j.topicKey === target?.topic);
  const saved = useObjectInfo(s => s.saved);
  const { refs, live } = target ? referencesFor(job, target.topic, saved) : { refs: [] as ObjectReference[], live: false };
  const active = stage === 'memory' && !paused && !workshop && !openStory;
  return { auth, library, target, job, refs, live, active, xr, viewing };
}
async function explore(target: InfoTarget) {
  const s = useGate.getState(), session = s.session;
  if (s.resting || s.stage !== 'memory') return;
  useObjectInfo.setState({ selected: target.id, busy: true, error: '', more: false });
  void loadSaved(); // shown at once; a live lookup replaces it when it finishes
  if (!session) { useObjectInfo.setState({ busy: false, error: 'Object information needs a connection. The memory is still here.' }); return; }
  try { await convex.action(api.objectKnowledgeActions.lookup, { code: session.code, token: session.token, topicKey: target.topic }); }
  catch { if (useObjectInfo.getState().selected === target.id) useObjectInfo.setState({ error: 'This reference is unavailable just now. You can keep exploring the memory.' }); }
  finally { if (useObjectInfo.getState().selected === target.id) useObjectInfo.setState({ busy: false }); }
}
/** The card's first passage, or (only with nothing saved for this topic either) what's happening. */
function infoText(c: Pick<ReturnType<typeof useInfoContext>, 'job' | 'refs'>, busy: boolean, error: string) {
  const lead = c.refs.find(r => r.kind !== 'photo');
  if (lead) return lead.excerpt;
  if (c.job?.error) return c.job.error;
  if (error) return error;
  return 'Looking up a short public explanation…';
}
/** Where this card's words come from, and whether a fresher lookup is on its way. */
function statusLine(c: Pick<ReturnType<typeof useInfoContext>, 'job' | 'refs' | 'live'>, busy: boolean, saved: string | null) {
  if (c.live) return `Found with Apify · ${new Date(c.refs[0]!.fetchedAt).toLocaleDateString()}`;
  const checking = busy || c.job?.status === 'starting' || c.job?.status === 'running';
  if (!c.refs.length) return checking ? 'Asking Apify…' : 'Public references';
  return checking ? 'Saved with Apify · checking for newer' : `Saved with Apify${saved ? ` · ${new Date(saved).toLocaleDateString()}` : ''}`;
}
const year = (date?: string) => /\b(1\d{3}|20\d{2})\b/.exec(date ?? '')?.[1] ?? '';

/** Only a topic lookup runs when a person selects a marker. Merely seeing an object makes no cloud calls. */
export function ObjectInfoHUD() { return enabled ? <InfoBoundary><InfoHUD /></InfoBoundary> : null; }
function InfoHUD() {
  const c = useInfoContext(), busy = useObjectInfo(s => s.busy), error = useObjectInfo(s => s.error), more = useObjectInfo(s => s.more);
  const targets = useObjectInfo(s => s.targets), selectedId = useObjectInfo(s => s.selected), refresh = useAction(api.objectKnowledgeActions.refresh);
  const code = c.auth?.code, token = c.auth?.token, runId = c.job?._id, running = c.job?.status === 'running';
  const plan = useMemory(s => s.plan), memoryId = useGate(s => s.memoryId);
  const scope = `${code ?? ''}:${memoryKey()}:${c.viewing}`;
  useEffect(() => { closeObjectInfo(); }, [scope, memoryId]);
  useEffect(() => { if (!c.active) closeObjectInfo(); else void loadSaved(); }, [c.active]); // ready for cards and for shaping what people name
  // Finished live lookups shape what people name too (object-info/inspiration.ts).
  useEffect(() => { useInspired.setState({ live: Object.fromEntries((c.library?.jobs ?? []).filter(j => j.status === 'ready' && j.references.some(r => r.kind !== 'photo')).map(j => [j.topicKey, j.references])) }); }, [c.library]);
  useEffect(() => { if (selectedId && !targets.some(t => t.id === selectedId)) closeObjectInfo(); }, [targets, selectedId]);
  useEffect(() => {
    if (!running || !runId || !code || !token || !c.active) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>, count = 0;
    const poll = async () => {
      try { await refresh({ code, token, id: runId }); } catch { /* A saved run resumes on reopening; never start another run here. */ }
      if (!cancelled && ++count < 45) timer = setTimeout(() => void poll(), 2500);
    };
    timer = setTimeout(() => void poll(), 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [code, token, runId, running, c.active, refresh]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeObjectInfo(); };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  void plan; // resubscribe when a prepared visit receives its durable memory key
  if (!c.active || c.xr) return null;
  const inspired = useInspired.getState().byId[c.target?.id ?? ''];
  // A thing shaped from a description opens on that description.
  const topic = c.target ? objectTopic(c.target.topic) : null, texts = c.refs.filter(r => r.kind !== 'photo').sort((a, b) => Number(b.sourceUrl === inspired?.source.sourceUrl) - Number(a.sourceUrl === inspired?.source.sourceUrl)), photos = c.refs.filter(r => r.kind === 'photo');
  const source = texts[0], savedAt = useObjectInfo.getState().saved?.retrievedAt ?? null;
  return <div className="object-info-hud" data-testid="object-info-hud">
    {targets.map(t => <button key={t.id} type="button" className="object-info-marker" style={{ display: 'none' }} ref={el => { if (el) infoButtons.set(t.id, el); else infoButtons.delete(t.id); }} onClick={() => void explore(t)} aria-label={`Explore ${t.label}`} aria-pressed={c.target?.id === t.id} data-topic={t.topic}><span aria-hidden="true">◇</span>{t.label}<small>Explore</small></button>)}
    {c.target && topic && <aside className="object-info-card" aria-label={`${topic.label} information`} data-testid="object-info-card">
      <div className="object-info-eyebrow"><span>{topic.label} · discover</span><button type="button" aria-label="Close object information" onClick={closeObjectInfo}>×</button></div>
      <h2>{topic.heading}</h2>
      {inspired && <p className="object-info-shaped" data-testid="object-info-shaped"><span>{c.target.label} · shaped from this, found with Apify</span>“{inspired.source.excerpt}” <em>— {inspired.source.attribution}</em></p>}
      {/* The description it was shaped from already leads; otherwise the first passage does. */}
      {!(inspired && source?.sourceUrl === inspired.source.sourceUrl) && <><p aria-live="polite" data-testid="object-info-text">{source?.excerpt ?? infoText(c, busy, error)}</p>
        {source && <small className="object-info-by">— {source.attribution}{source.title !== topic.label ? `, ${source.title}` : ''}</small>}</>}
      {texts.slice(1, 3).map(r => <p key={r.sourceUrl} className="object-info-also"><span>{r.attribution}{r.title !== topic.label ? ` · ${r.title}` : ''}</span>{r.excerpt}</p>)}
      {photos.length > 0 && <figure className="object-info-photos" data-testid="object-info-photos">
        <div>{photos.map(p => <a key={p.sourceUrl} href={p.sourceUrl} target="_blank" rel="noreferrer" title={`${p.title}${p.date ? ` (${p.date})` : ''}`}><img src={p.imageUrl} alt={p.title} loading="lazy" referrerPolicy="no-referrer" /><span>{year(p.date) || 'Undated'}</span></a>)}</div>
        <figcaption>Old photos from the Library of Congress · not from your story</figcaption>
      </figure>}
      {c.target.topic !== 'kite' && <p className="object-info-context">{topic.context}</p>}
      {source && <><a href={source.sourceUrl} target="_blank" rel="noreferrer">Read source ↗</a><button type="button" className="object-info-more" onClick={() => useObjectInfo.setState({ more: !more })} aria-expanded={more}>{more ? 'Less' : 'Source details'}</button>{more && <ul className="object-info-context object-info-sources">{texts.map(r => <li key={r.sourceUrl}><a href={r.sourceUrl} target="_blank" rel="noreferrer">{r.title}</a> · {r.attribution}{r.license ? ` · ${r.license}` : ''}</li>)}{photos.map(p => <li key={p.sourceUrl}><a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.title}</a> · Library of Congress{p.date ? ` · ${p.date}` : ''}</li>)}<li>Retrieved {new Date(source.fetchedAt).toLocaleDateString()}</li></ul>}</>}
      <small className="object-info-credit">{statusLine(c, busy, savedAt)}<span>General information · separate from your story</span></small>
    </aside>}
  </div>;
}

/** Discover actual rendered objects from the shared plan, the current POV, and approved optional props. */
function useTargets() {
  const plan = useMemory(s => s.plan), own = useSocial(s => s.objects), viewing = useSocial(s => s.viewing), perspectives = useSocial(s => s.perspectives);
  const memoryId = useGate(s => s.memoryId), session = useGate(s => s.session), photoWorld = useGate(s => !!s.photoWorld), worldId = useSocial(s => s.worldId);
  const optional = useQuery(api.memoryObjects.list, session ? { code: session.code, token: session.token } : 'skip');
  return useMemo(() => buildInfoTargets({ planObjects: plan?.objects ?? [], perspectiveObjects: own, optionalObjects: optional?.objects ?? [],
    memoryKey: memoryKey(), perspectiveId: viewingPerspective().id, viewing, photoWorld, worldId,
  }), [plan, own, viewing, perspectives, optional, memoryId, photoWorld, worldId]);
}
const point = new THREE.Vector3(), eye = new THREE.Vector3(), projected = new THREE.Vector3();
function isVisible(node: THREE.Object3D) { for (let p: THREE.Object3D | null = node; p; p = p.parent) if (!p.visible) return false; return true; }
export function ObjectInfoLayer() { return enabled ? <InfoBoundary><InfoLayer /></InfoBoundary> : null; }
function InfoLayer() {
  const targets = useTargets(), c = useInfoContext(), scene = useThree(s => s.scene), camera = useThree(s => s.camera), gl = useThree(s => s.gl);
  const markers = useRef(new Map<string, THREE.Group>()), last = useRef(0);
  useEffect(() => { useObjectInfo.setState({ targets }); }, [targets]);
  useEffect(() => () => { useObjectInfo.setState({ targets: [] }); closeObjectInfo(); }, []);
  useEffect(() => {
    const diagnostic = { snapshot: () => ({ selected: useObjectInfo.getState().selected, xr: gl.xr.isPresenting, markers: targets.map(t => { const m = markers.current.get(t.id); return { id: t.id, topic: t.topic, node: t.node, position: m?.position.toArray(), visible: m?.visible ?? infoButtons.get(t.id)?.style.display === 'block' }; }), card: !!scene.getObjectByName('ObjectInfoPanel') }),
      // Read-only target coordinates in the emulator's physical reference space, for real controller-ray checks.
      rayTarget: (name: string) => { const target = scene.getObjectByName(name), origin = xrStore.getState().origin; if (!target || !origin) return null; return origin.worldToLocal(target.getWorldPosition(new THREE.Vector3())).toArray(); } };
    const w = window as unknown as { __objectInfo?: typeof diagnostic }; w.__objectInfo = diagnostic;
    return () => { if (w.__objectInfo === diagnostic) delete w.__objectInfo; };
  }, [targets, gl, scene]);
  useFrame(({ size, clock }) => {
    // DOM marker positions update at 20Hz without React renders or modifying any scene object.
    if (!c.xr && clock.elapsedTime - last.current < .05) return; last.current = clock.elapsedTime;
    const viewCamera = c.xr ? gl.xr.getCamera() : camera;
    viewCamera.getWorldPosition(eye); let shown = 0;
    const occupied: { x: number; y: number }[] = [];
    for (const t of targets) {
      const nodeName = c.xr && t.node === 'memory-held-spool' ? 'memory-held-kite' : t.node;
      const node = nodeName ? scene.getObjectByName(nodeName) : undefined, dom = infoButtons.get(t.id), marker = markers.current.get(t.id);
      let visible = c.active && (!!t.anchor || !!node && isVisible(node) && (t.topic === 'kite' || t.id.startsWith('optional:') || (formation.get(t.id) ?? 0) > .95));
      let x = 0, y = 0;
      if (visible) {
        if (t.anchor) point.fromArray(t.anchor); else {
          node!.getWorldPosition(point); point.y += c.xr && t.node === 'memory-held-spool' ? -.30 : t.lift;
          // The kite is moving geometry: keep its native tag beside, and slightly in front of, the model so a
          // visible label is also reachable by a controller ray. Only this new tag's point is offset.
          if (c.xr && t.node === 'memory-held-spool') { projected.setFromMatrixColumn(viewCamera.matrixWorld, 0); point.addScaledVector(projected, .42); projected.subVectors(eye, point).normalize(); point.addScaledVector(projected, .12); }
        }
        projected.copy(point).project(viewCamera);
        x = (projected.x + 1) * size.width / 2; y = (1 - projected.y) * size.height / 2;
        visible = point.distanceTo(eye) < (c.xr ? 9 : 18) && (c.xr || projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .92 && Math.abs(projected.y) < .86);
        // A tag comes only once its thing is pointed at (a pinch or a tap near it, for a while): nothing is labelled as
        // the place appears.
        const mark = usePresence.getState().myPoint;
        visible = visible && !!mark && serverNow() - mark.t < 15_000 && Math.hypot(mark.at[0]! - point.x, mark.at[2]! - point.z) < 1.5;
        if (!c.xr) visible = visible && x > 75 && x < size.width - 75 && y > 110 && y < size.height - 160 && !occupied.some(p => Math.abs(p.x - x) < 150 && Math.abs(p.y - y) < 60);
        if (visible && shown >= 4) visible = false;
        if (visible) { shown++; occupied.push({ x, y }); if (marker) marker.position.copy(point); }
      }
      if (dom) { dom.style.display = visible ? 'block' : 'none'; if (visible) { dom.style.left = `${x}px`; dom.style.top = `${y}px`; } }
      if (marker) marker.visible = visible;
    }
  });
  return <group name="ObjectInfoAddOn"><Suspense fallback={null}>{c.xr && c.active && targets.map(t => <group key={t.id} ref={el => { if (el) markers.current.set(t.id, el); else markers.current.delete(t.id); }} visible={false} name={`ObjectInfoMarker:${t.id}`} userData={{ noPoint: true, topic: t.topic }}><Billboard><mesh onClick={e => { e.stopPropagation(); void explore(t); }} renderOrder={1988}><planeGeometry args={[.38, .115]} /><meshBasicMaterial color="#fcf2df" transparent opacity={1} depthTest={false} depthWrite={false} toneMapped={false} /></mesh><Text font={fontUrl} fontSize={.025} maxWidth={.35} position={[0, 0, .003]} color="#282d35" renderOrder={1989} material-depthTest={false} material-toneMapped={false}>{`${objectTopic(t.topic).label} · explore`}</Text></Billboard></group>)}{c.xr && c.active && c.target && <NativeInfo target={c.target} job={c.job} />}</Suspense></group>;
}
function NativeInfo({ target, job }: { target: InfoTarget; job: ReturnType<typeof useInfoContext>['job'] }) {
  const gl = useThree(s => s.gl), panel = useRef<THREE.Group>(null), placed = useRef('');
  const busy = useObjectInfo(s => s.busy), error = useObjectInfo(s => s.error), more = useObjectInfo(s => s.more);
  const topic = objectTopic(target.topic), saved = useObjectInfo(s => s.saved);
  const { refs } = referencesFor(job, target.topic, saved), texts = refs.filter(r => r.kind !== 'photo'), source = texts[0];
  // The headset's panel holds about nine lines: the first passage, cut at a sentence when it's long.
  const fit = (t: string) => (t.length <= 300 ? t : t.slice(0, 300).match(/^[\s\S]*[.!?](?=\s)/)?.[0] ?? `${t.slice(0, 297)}…`);
  const words = source ? fit(source.excerpt) : infoText({ job, refs }, busy, error);
  const scratch = useMemo(() => ({ head: new THREE.Vector3(), q: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ') }), []);
  useFrame(() => {
    if (!panel.current || placed.current === target.id) return;
    const camera = gl.xr.getCamera();
    camera.getWorldPosition(scratch.head); camera.getWorldQuaternion(scratch.q); scratch.euler.setFromQuaternion(scratch.q, 'YXZ');
    const yaw = scratch.euler.y, k = useSocial.getState().xr.k;
    panel.current.position.set(scratch.head.x - Math.sin(yaw) * 1.65 * k + Math.cos(yaw) * .55 * k, scratch.head.y + .05 * k, scratch.head.z - Math.cos(yaw) * 1.65 * k - Math.sin(yaw) * .55 * k);
    panel.current.rotation.y = yaw; panel.current.scale.setScalar(k); placed.current = target.id;
  });
  const press = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); fn(); };
  return <group ref={panel} name="ObjectInfoPanel" userData={{ noPoint: true, topic: target.topic }}>
    <mesh renderOrder={1994}><planeGeometry args={[.70, .56]} /><meshBasicMaterial color="#fcf2df" transparent opacity={1} depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
    <Text font={fontUrl} fontSize={.031} maxWidth={.60} position={[0, .215, .004]} color="#282d35" renderOrder={1995} material-depthTest={false} material-toneMapped={false}>{topic.heading}</Text>
    <Text font={fontUrl} fontSize={.025} maxWidth={.60} anchorY="top" textAlign="left" position={[-.30, .15, .004]} anchorX="left" color="#282d35" renderOrder={1995} material-depthTest={false} material-toneMapped={false}>{more && source ? `${texts.map(r => `${r.title} · ${r.attribution}`).join('\n')}\n${topic.context}` : words}</Text>
    <Text font={fontUrl} fontSize={.017} maxWidth={.61} textAlign="center" position={[0, -.13, .004]} color="#59604e" renderOrder={1995} material-depthTest={false} material-toneMapped={false}>{source ? `${source.attribution}\n${target.topic === 'flowers' ? 'Flower example · species not identified' : 'Public context, separate from your story'}` : 'Public references'}</Text>
    {([[-.17, 'Back', closeObjectInfo], [.17, more ? 'Less' : 'Details', () => useObjectInfo.setState({ more: !more })]] as const).map(([x, label, fn]) => <group key={x} position={[x, -.225, .006]} name={`ObjectInfoAction:${label}`}><mesh onClick={press(fn)} renderOrder={1996}><planeGeometry args={[.29, .07]} /><meshBasicMaterial color="#e5d2ae" transparent opacity={1} depthTest={false} depthWrite={false} toneMapped={false} /></mesh><Text font={fontUrl} fontSize={.024} position-z={.002} color="#282d35" renderOrder={1997} material-depthTest={false} material-toneMapped={false}>{label}</Text></group>)}
  </group>;
}
