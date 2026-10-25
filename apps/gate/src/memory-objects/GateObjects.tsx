import { useMutation, useQuery } from 'convex/react';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '../../../../convex/_generated/api';
import { useGate } from '../state/store';
import { useSocial } from '../social/store';
import { memoryKey, setViewing } from '../social/perspectives';
import { flow } from '../flow/controller';
import { SourceLibrary, useImportProgress } from '../red-kite/SourceLibrary';
import { NativeSources } from '../red-kite/StoryScene';
import { PlaceLibrary, useModelProgress } from './PlaceLibrary';
import { OptionalObjects } from './OptionalObjects';
import { modelSource, type ModelId, type ObjectLibrary, type RoomAuth } from './types';
import { useObjectWorkshop } from './workshop';
import './objects.css';

function useContext() {
  const session = useGate(s => s.session), stage = useGate(s => s.stage), resting = useGate(s => s.resting), xr = useGate(s => s.xr);
  const viewing = useSocial(s => s.viewing), name = useGate(s => s.memoryTitle), memoryId = useGate(s => s.memoryId);
  const auth = session ? { code: session.code, token: session.token } : null;
  const objects = useQuery(api.memoryObjects.list, auth ?? 'skip'), sources = useQuery(api.memorySources.list, auth ?? 'skip');
  const currentMemory = memoryKey(); // same scope as the teammate's SpacetimeDB perspective objects
  void name; void memoryId; // subscribe when the memory's key is assigned or changed
  return { auth, objects, sources, viewing, stage, resting, xr, currentMemory };
}
const perspectives = [{ key: 'grandparent', label: 'Grandparent' }, { key: 'child', label: 'Grandchild' }, { key: 'shared', label: 'Both perspectives' }];
export function GateObjectsUI() {
  const c = useContext(), w = useObjectWorkshop(), [error, setError] = useState('');
  const place = useMutation(api.memoryObjects.place), hide = useMutation(api.memoryObjects.hide);
  useImportProgress(c.auth, c.sources); useModelProgress(c.auth, c.objects);
  const scope = `${c.auth?.code ?? ''}:${c.currentMemory}`, previousScope = useRef(scope);
  useEffect(() => {
    const current = useObjectWorkshop.getState(), sameMemory = previousScope.current === scope; previousScope.current = scope;
    if (sameMemory && current.preview && (current.previewPerspective === c.viewing || current.previewPerspective === 'shared')) return;
    current.set({ selected: null, preview: null, open: false, photos: false });
  }, [scope, c.viewing]);
  const active = c.stage === 'memory' || c.stage === 'forming';
  const selected = c.objects?.objects.find(o => o._id === w.selected && (o.memoryKey ?? 'red-kite') === c.currentMemory && (o.perspective === c.viewing || o.perspective === 'shared'));
  const preview = (id: ModelId, perspective: string) => { w.set({ open: false, photos: false, selected: id, preview: id, previewPerspective: perspective }); if (perspective === 'grandparent' || perspective === 'child') setViewing(perspective); };
  if (!c.auth || !active || c.xr) return null;
  async function write(fn: () => Promise<unknown>) { setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message.slice(0, 220) : 'Could not change this object.'); } }
  const source = selected && c.objects ? modelSource(selected, c.objects, c.sources) : null;
  return <>
    {w.open && <PlaceLibrary auth={c.auth} objects={c.objects} sources={c.sources} perspectives={perspectives} perspective={c.viewing} memoryKey={c.currentMemory} paused={c.resting} initialSourceId={w.source} onClose={() => w.set({ open: false })} onPhotos={() => w.set({ open: false, photos: true })} onPreview={preview} />}
    {w.photos && <SourceLibrary session={c.auth} library={c.sources} perspective={c.viewing} perspectives={perspectives} paused={c.resting} onClose={() => w.set({ photos: false })} onMakeObject={id => w.set({ photos: false, open: true, source: id })} />}
    {selected && source && !w.open && !w.photos && <aside className="gate-object-card" data-testid="gate-object-source"><strong>{selected.label}</strong><p>{selected.status === 'placed' ? 'Reviewed illustration in this perspective.' : 'Private model preview · family only.'}</p><p>{source.note || source.caption}</p>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">Original source ↗</a>}{c.objects?.canAuthor && selected.status === 'ready' && <button disabled={c.resting} onClick={() => void write(async () => { await place({ ...c.auth!, id: selected._id }); w.set({ preview: null }); })}>Place this object</button>}{c.objects?.canAuthor && selected.status === 'placed' && <button disabled={c.resting} onClick={() => void write(() => hide({ ...c.auth!, id: selected._id }))}>Hide object</button>}<button onClick={() => w.set({ selected: null, preview: null })}>Close source</button>{error && <p role="alert">{error}</p>}</aside>}
  </>;
}

export function GateObjectsLayer() {
  const c = useContext(), selectedId = useObjectWorkshop(s => s.selected), preview = useObjectWorkshop(s => s.preview);
  const select = (id: ModelId) => useObjectWorkshop.getState().set({ selected: id });
  if (!c.auth || !c.objects || !['forming', 'memory'].includes(c.stage)) return null;
  const selected = c.objects.objects.find(o => o._id === selectedId && (o.memoryKey ?? 'red-kite') === c.currentMemory && (o.perspective === c.viewing || o.perspective === 'shared'));
  return <><OptionalObjects objects={c.objects.objects} perspective={c.viewing} memoryKey={c.currentMemory} previewId={preview} paused={c.resting} onSelect={select} />{c.xr && selected && <FollowingSource auth={c.auth} objects={c.objects} source={modelSource(selected, c.objects, c.sources)} objectId={selected._id} ready={selected.status === 'ready' && c.objects.canAuthor} paused={c.resting} />}</>;
}
function FollowingSource({ auth, objects, source, objectId, ready, paused }: { auth: RoomAuth; objects: ObjectLibrary; source: ReturnType<typeof modelSource>; objectId: ModelId; ready: boolean; paused: boolean }) {
  const group = useRef<THREE.Group>(null), camera = useThree(s => s.camera), place = useMutation(api.memoryObjects.place);
  const position = useRef(new THREE.Vector3()), rotation = useRef(new THREE.Quaternion()), target = useRef(new THREE.Quaternion()), euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useFrame((_, dt) => { if (!group.current) return; camera.getWorldPosition(position.current); camera.getWorldQuaternion(rotation.current); euler.current.setFromQuaternion(rotation.current, 'YXZ'); target.current.setFromEuler(new THREE.Euler(0, euler.current.y, 0)); group.current.position.lerp(position.current, 1 - Math.exp(-dt * 5)); group.current.quaternion.slerp(target.current, 1 - Math.exp(-dt * 5)); });
  const publish = async () => { if (!ready || paused || busy) return; setBusy(true); try { await place({ ...auth, id: objectId }); useObjectWorkshop.getState().set({ preview: null }); } catch { setError('The object could not be placed. Review it on the family screen.'); } finally { setBusy(false); } };
  void objects;
  return <group ref={group}><NativeSources anchor={[0, -.34, -1.65]} controls={{ photo: error ? { ...source, note: error } : source, paused, locked: paused || busy, sourceIndex: 0, sourceCount: 1, sourceActionLabel: ready ? 'Place this object' : undefined,
    onSourceNext: () => void publish(), onSourcesClose: () => useObjectWorkshop.getState().set({ selected: null, preview: null }), onRest: () => paused ? flow.resume() : flow.rest() }} /></group>;
}
