/** An additive object HUD. It observes existing objects; it never moves them, the camera, or the XR origin. */
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useAction, useQuery } from 'convex/react';
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import { api } from '../../../../convex/_generated/api';
import { OBJECT_TOPICS, topicForKind, type ObjectTopicKey } from '../../../../actors/historical-memory-atlas/src/knowledge.mjs';
import { entryOf } from '../../../../packages/shared/src/scene';
import { useGate } from '../state/store';
import { useMemory } from '../flow/memory';
import { memoryKey } from '../social/perspectives';
import { useSocial, viewingPerspective } from '../social/store';
import { MEADOW_WORLD_ID } from '../social/world';
import { useObjectWorkshop } from '../memory-objects/workshop';
import { formation } from '../scene/sketch/SketchObject';
import { xrStore } from '../scene/xr';
import { convex } from '../backend/client';
import { closeObjectInfo, infoButtons, useObjectInfo, type InfoTarget } from './state';
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
  const active = stage === 'memory' && !paused && !workshop && !openStory;
  return { auth, library, target, job, active, xr, viewing };
}
async function explore(target: InfoTarget) {
  const s = useGate.getState(), session = s.session;
  if (s.resting || s.stage !== 'memory') return;
  useObjectInfo.setState({ selected: target.id, busy: true, error: '', more: false });
  if (!session) { useObjectInfo.setState({ busy: false, error: 'Object information needs a connection. The memory is still here.' }); return; }
  try { await convex.action(api.objectKnowledgeActions.lookup, { code: session.code, token: session.token, topicKey: target.topic }); }
  catch { if (useObjectInfo.getState().selected === target.id) useObjectInfo.setState({ error: 'This reference is unavailable just now. You can keep exploring the memory.' }); }
  finally { if (useObjectInfo.getState().selected === target.id) useObjectInfo.setState({ busy: false }); }
}
function infoText(job: ReturnType<typeof useInfoContext>['job'], busy: boolean, error: string) {
  if (job?.status === 'ready') return job.references[0]?.excerpt ?? 'No explanation was returned.';
  if (job?.error) return job.error;
  if (error) return error;
  return busy || job?.status === 'starting' || job?.status === 'running' ? 'Looking up a short public explanation…' : 'The source is not available just now.';
}

/** Only a topic lookup runs when a person selects a marker. Merely seeing an object makes no cloud calls. */
export function ObjectInfoHUD() { return enabled ? <InfoBoundary><InfoHUD /></InfoBoundary> : null; }
function InfoHUD() {
  const c = useInfoContext(), busy = useObjectInfo(s => s.busy), error = useObjectInfo(s => s.error), more = useObjectInfo(s => s.more);
  const targets = useObjectInfo(s => s.targets), selectedId = useObjectInfo(s => s.selected), refresh = useAction(api.objectKnowledgeActions.refresh);
  const code = c.auth?.code, token = c.auth?.token, runId = c.job?._id, running = c.job?.status === 'running';
  const plan = useMemory(s => s.plan), memoryId = useGate(s => s.memoryId);
  const scope = `${code ?? ''}:${memoryKey()}:${c.viewing}`;
  useEffect(() => { closeObjectInfo(); }, [scope, memoryId]);
  useEffect(() => { if (!c.active) closeObjectInfo(); }, [c.active]);
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
  const topic = c.target ? OBJECT_TOPICS[c.target.topic] : null, source = c.job?.references[0];
  return <div className="object-info-hud" data-testid="object-info-hud">
    {targets.map(t => <button key={t.id} type="button" className="object-info-marker" style={{ display: 'none' }} ref={el => { if (el) infoButtons.set(t.id, el); else infoButtons.delete(t.id); }} onClick={() => void explore(t)} aria-label={`Explore ${t.label}`} aria-pressed={c.target?.id === t.id} data-topic={t.topic}><span aria-hidden="true">◇</span>{t.label}<small>Explore · Apify</small></button>)}
    {c.target && topic && <aside className="object-info-card" aria-label={`${topic.label} information`} data-testid="object-info-card">
      <div className="object-info-eyebrow"><span>{topic.label} · discover</span><button type="button" aria-label="Close object information" onClick={closeObjectInfo}>×</button></div>
      <h2>{topic.heading}</h2><p aria-live="polite">{infoText(c.job, busy, error)}</p>
      {c.target.topic !== 'kite' && <p className="object-info-context">{topic.context}</p>}
      {source && <><a href={source.sourceUrl} target="_blank" rel="noreferrer">Read source ↗</a><button type="button" className="object-info-more" onClick={() => useObjectInfo.setState({ more: !more })} aria-expanded={more}>{more ? 'Less' : 'Source details'}</button>{more && <p className="object-info-context">{source.title}<br />{source.attribution}<br />Retrieved {new Date(source.fetchedAt).toLocaleDateString()}</p>}</>}
      <small className="object-info-credit">{source ? `via Apify · ${source.attribution}` : 'via Apify · public references'}{source && <span>General information · separate from your story</span>}</small>
    </aside>}
  </div>;
}

/** Discover actual rendered objects from the shared plan, the current POV, and approved optional props. */
function useTargets() {
  const plan = useMemory(s => s.plan), own = useSocial(s => s.objects), viewing = useSocial(s => s.viewing), perspectives = useSocial(s => s.perspectives);
  const memoryId = useGate(s => s.memoryId), session = useGate(s => s.session), photoWorld = useGate(s => !!s.photoWorld), worldId = useSocial(s => s.worldId);
  const optional = useQuery(api.memoryObjects.list, session ? { code: session.code, token: session.token } : 'skip');
  return useMemo(() => {
    const targets: InfoTarget[] = [], seen = new Set<string>(), key = memoryKey(), perspective = viewingPerspective().id;
    const add = (id: string, kind: string, label: string, scale = 1) => {
      const topic = topicForKind(kind); if (!topic || kind === 'spool' || seen.has(id)) return; seen.add(id);
      targets.push({ id, label: label.length > 32 ? OBJECT_TOPICS[topic].label : label, topic, node: kind === 'kite' ? 'memory-held-spool' : `memory-${id}`, lift: kind === 'kite' ? .16 : Math.min(1.7, entryOf(kind).h * scale) + .16 });
    };
    for (const o of plan?.objects ?? []) add(o.id, o.kind, o.label, o.scale);
    for (const o of own) if (o.memoryId === key && o.perspectiveId === perspective) add(o.data.id, o.data.kind, o.data.label, o.data.scale);
    // Authored semantic hotspots for this one checked world, whose scenery is baked into a splat.
    // These do not add flowers/trees, infer a species, or appear in arbitrary uploaded/generated worlds.
    if (photoWorld && worldId === MEADOW_WORLD_ID) targets.push(
      { id: 'meadow:flowers', label: 'Flowers by the path', topic: 'flowers', node: '', lift: 0, anchor: [1.65, .42, -1.8] },
      { id: 'meadow:oak', label: 'The tree', topic: 'trees', node: '', lift: 0, anchor: [-1.7, 1.5, -3.4] },
    );
    for (const o of optional?.objects ?? []) {
      if (o.status !== 'placed' || (o.memoryKey ?? 'red-kite') !== key || ![viewing, 'shared'].includes(o.perspective)) continue;
      const kind = o.assetKey === 'flower' ? 'flower' : o.assetKey === 'kite' || o.choice.includes('kite') ? 'kite' : o.choice.replace('library:', ''), topic = topicForKind(kind);
      if (topic) targets.push({ id: `optional:${o._id}`, label: OBJECT_TOPICS[topic].label, topic, node: `MemoryObject:${o._id}`, lift: o.size + .14 });
    }
    return targets.slice(0, 12);
  }, [plan, own, viewing, perspectives, optional, memoryId, photoWorld, worldId]);
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
        if (!c.xr) visible = visible && x > 75 && x < size.width - 75 && y > 110 && y < size.height - 160 && !occupied.some(p => Math.abs(p.x - x) < 150 && Math.abs(p.y - y) < 60);
        if (visible && shown >= 3) visible = false;
        if (visible) { shown++; occupied.push({ x, y }); if (marker) marker.position.copy(point); }
      }
      if (dom) { dom.style.display = visible ? 'block' : 'none'; if (visible) { dom.style.left = `${x}px`; dom.style.top = `${y}px`; } }
      if (marker) marker.visible = visible;
    }
  });
  return <group name="ObjectInfoAddOn"><Suspense fallback={null}>{c.xr && c.active && targets.map(t => <group key={t.id} ref={el => { if (el) markers.current.set(t.id, el); else markers.current.delete(t.id); }} visible={false} name={`ObjectInfoMarker:${t.id}`} userData={{ noPoint: true, topic: t.topic }}><Billboard><mesh onClick={e => { e.stopPropagation(); void explore(t); }} renderOrder={1988}><planeGeometry args={[.38, .115]} /><meshBasicMaterial color="#fcf2df" transparent opacity={1} depthTest={false} depthWrite={false} toneMapped={false} /></mesh><Text font={fontUrl} fontSize={.025} maxWidth={.35} position={[0, .019, .003]} color="#282d35" renderOrder={1989} material-depthTest={false} material-toneMapped={false}>{`${OBJECT_TOPICS[t.topic].label} · explore`}</Text><Text font={fontUrl} fontSize={.016} position={[0, -.024, .003]} color="#59604e" renderOrder={1989} material-depthTest={false} material-toneMapped={false}>via Apify</Text></Billboard></group>)}{c.xr && c.active && c.target && <NativeInfo target={c.target} job={c.job} />}</Suspense></group>;
}
function NativeInfo({ target, job }: { target: InfoTarget; job: ReturnType<typeof useInfoContext>['job'] }) {
  const gl = useThree(s => s.gl), panel = useRef<THREE.Group>(null), placed = useRef('');
  const busy = useObjectInfo(s => s.busy), error = useObjectInfo(s => s.error), more = useObjectInfo(s => s.more);
  const topic = OBJECT_TOPICS[target.topic], source = job?.references[0];
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
    <Text font={fontUrl} fontSize={.025} maxWidth={.60} anchorY="top" textAlign="left" position={[-.30, .15, .004]} anchorX="left" color="#282d35" renderOrder={1995} material-depthTest={false} material-toneMapped={false}>{more && source ? `${source.title}\n${topic.context}\n${source.attribution}` : infoText(job, busy, error)}</Text>
    <Text font={fontUrl} fontSize={.017} maxWidth={.61} textAlign="center" position={[0, -.13, .004]} color="#59604e" renderOrder={1995} material-depthTest={false} material-toneMapped={false}>{source ? `via Apify · ${source.attribution}\nPublic context, separate from your story` : 'via Apify · public references'}</Text>
    {([[-.17, 'Back', closeObjectInfo], [.17, more ? 'Less' : 'Details', () => useObjectInfo.setState({ more: !more })]] as const).map(([x, label, fn]) => <group key={x} position={[x, -.225, .006]} name={`ObjectInfoAction:${label}`}><mesh onClick={press(fn)} renderOrder={1996}><planeGeometry args={[.29, .07]} /><meshBasicMaterial color="#e5d2ae" transparent opacity={1} depthTest={false} depthWrite={false} toneMapped={false} /></mesh><Text font={fontUrl} fontSize={.024} position-z={.002} color="#282d35" renderOrder={1997} material-depthTest={false} material-toneMapped={false}>{label}</Text></group>)}
  </group>;
}
