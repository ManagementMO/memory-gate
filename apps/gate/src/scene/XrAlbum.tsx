// The album in the headset. Leaving a memory in VR keeps you in VR: the album opens where you are, a gentle arc of
// panes a couple of metres ahead, placed from where you're looking as it opens (so it's in front whichever way the
// headset's tracking faces). On the left, yours: your own visits, then the samples to step into. On the right, San
// Francisco: the memories people shared there (the page's map can't be seen in VR), the Golden Gate first. Point and
// pull the trigger (or pinch) at one and it comes forward with its words; step into it from there. Beneath the arc:
// visit another memory, back to the start, or leave the headset (the album is waiting on the page there too). Back at
// the start, Begin and the album are within reach as well. Moves that would carry you across the world (into a memory,
// back to the shore) happen behind a short soft blink, never with your eyes open.
import { Text } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import sansUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import boldUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-600-normal.woff?url';
import serifUrl from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff?url';
import { CARD, DETAIL, coverOf, fontsReady, loadImage, paintCard, paintDetail, paintShared, type DetailLayout, type SharedPage } from '../album/cardCanvas';
import { countWord, summaryLine, todayLine } from '../album/format';
import { PREPARED, preparedVisit } from '../album/prepared';
import type { AlbumMemory } from '../album/types';
import { useAlbum } from '../album/useAlbum';
import { flow } from '../flow/controller';
import { GOLDEN_GATE_CROWD, SF_MEMORIES, SF_PLACES, sfMemory, type SfMemory } from '../sf/memories';
import { useGate } from '../state/store';
import { damp } from './util';
import { xrStore } from './xr';

const R = 1.6; // the arc: a little more than arm's length ahead, centred on where you stand
const NEAR = 1.2; // a chosen memory comes this close
const OWN_W = 0.46, SAMPLE_W = 0.42, GAP = 0.05;
const SF_W = 0.34, SF_GAP = 0.04; // seven of them, in two rows: a little smaller than yours
const SPLIT = 0.1; // the space between yours and San Francisco's (radians on the arc)
const DETAIL_W = 0.84, DETAIL_H = DETAIL_W * (DETAIL.h / DETAIL.w);
const MAX_OWN = 3; // the newest few (the page's album keeps them all)
const ORDER = 1980; // over the world, with the rest of the headset's words (under the veil)
const INK = '#1d1c2e';

const _head = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

/** Where the eyes are and which way they face (world), and whether that moved further in one frame than a head can:
 *  the world was turned or carried to face the wearer (PlayerOrigin does that at each phase), so re-place. */
type Pose = { x: number; y: number; z: number; yaw: number; seen: boolean };
function readHead(camera: THREE.Camera, last: Pose): boolean {
  camera.getWorldPosition(_head);
  camera.getWorldQuaternion(_q);
  const yaw = _e.setFromQuaternion(_q, 'YXZ').y;
  const turned = Math.abs(Math.atan2(Math.sin(yaw - last.yaw), Math.cos(yaw - last.yaw)));
  const jumped = last.seen && (Math.hypot(_head.x - last.x, _head.y - last.y, _head.z - last.z) > 0.5 || turned > 0.35);
  last.x = _head.x; last.y = _head.y; last.z = _head.z; last.yaw = yaw; last.seen = true;
  return jumped;
}

/** A rounded rectangle whose UVs span it (0..1), so a painted canvas fills it corner to corner. */
function roundedPlane(w: number, h: number, r: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, h / 2 - r);
  s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -h / 2 + r);
  s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ShapeGeometry(s, 10);
  const pos = g.attributes.position!, uv = g.attributes.uv!;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return g;
}

function pill(w: number, h: number): THREE.ShapeGeometry {
  const r = h / 2, s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return new THREE.ShapeGeometry(s, 24);
}

// ------------------------------------------------------------ the veil: a short soft blink around the eyes
const veil = { level: 0, phase: 'idle' as 'idle' | 'out' | 'in', hold: 0, action: null as null | (() => void) };
/** Blink, do this while the eyes are closed (a move across the world), then open again. */
function blinkThen(action: () => void) {
  if (veil.phase === 'out') return;
  veil.phase = 'out';
  veil.action = action;
}

function Veil() {
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.Mesh>(null);
  const last = useRef<string | null>(null);
  // A blink cut short by the session ending never finishes in the next one.
  useEffect(() => {
    const reset = () => { veil.level = 0; veil.phase = 'idle'; veil.hold = 0; veil.action = null; };
    reset();
    return reset;
  }, []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const stage = useGate.getState().stage;
    // The album opens where you are: the step from the memory's ground to the palace's happens behind the veil.
    if (stage === 'album' && last.current !== null && last.current !== 'album') { veil.level = 1; veil.phase = 'in'; veil.hold = 0.3; }
    last.current = stage;
    if (veil.phase === 'out') {
      veil.level = Math.min(1, veil.level + dt / 0.28);
      if (veil.level >= 1) {
        const act = veil.action;
        veil.action = null; veil.phase = 'in'; veil.hold = 0.4;
        try { act?.(); } catch (e) { console.warn('[xr album]', e); }
      }
    } else if (veil.phase === 'in') {
      if (veil.hold > 0) veil.hold -= dt;
      else { veil.level = Math.max(0, veil.level - dt / 0.6); if (veil.level <= 0) veil.phase = 'idle'; }
    }
    const m = mesh.current;
    if (!m) return;
    m.visible = veil.level > 0.002;
    camera.getWorldPosition(m.position);
    (m.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(veil.level, 0, 1);
  });
  return (
    <mesh ref={mesh} visible={false} renderOrder={3001} frustumCulled={false}>
      <sphereGeometry args={[0.3, 24, 16]} />
      <meshBasicMaterial color="#f2f1f8" side={THREE.BackSide} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

// ------------------------------------------------------------ painted panes
type Paint = (ctx: CanvasRenderingContext2D, alive: () => boolean, commit: () => void) => Promise<void>;
/** A canvas texture painted (and repainted when `key` changes) by `paint`; a failed paint leaves what was there. */
function usePainted(w: number, h: number, paint: Paint, key: string): THREE.CanvasTexture {
  const gl = useThree((s) => s.gl);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    return t;
  }, [w, h, gl]);
  useEffect(() => () => tex.dispose(), [tex]);
  const paintRef = useRef(paint);
  paintRef.current = paint;
  useEffect(() => {
    let live = true;
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    paintRef.current(ctx, () => live, () => { if (live) tex.needsUpdate = true; }).catch((e) => console.warn('[xr album] a pane could not be drawn', e));
    return () => { live = false; };
  }, [tex, key]);
  return tex;
}

const quick = <T,>(p: Promise<T>, ms: number): Promise<T | undefined> => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

/** Which album pane the pointer is on (for the test hook and the hover lift). */
const hovered = new Set<string>();

type PaneProps = { memory: AlbumMemory; w: number; x: number; y: number; z: number; yaw: number; index: number; dim: boolean; titleLines?: number; onPick: (m: AlbumMemory) => void };
function Pane({ memory, w, x, y, z, yaw, index, dim, titleLines, onPick }: PaneProps) {
  const h = w * (CARD.h / CARD.w);
  const geo = useMemo(() => roundedPlane(w, h, w * (44 / CARD.w)), [w, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  const cover = coverOf(memory)?.imageUrl ?? null;
  const tex = usePainted(CARD.w, CARD.h, async (ctx, alive, commit) => {
    await fontsReady();
    if (!alive()) return;
    const ready = await quick(loadImage(cover), 150);
    paintCard(ctx, memory, ready ?? null, titleLines);
    commit();
    if (ready !== undefined) return;
    const img = await loadImage(cover);
    if (!alive() || !img) return;
    paintCard(ctx, memory, img, titleLines);
    commit();
  }, `${memory.id}|${memory.title}|${cover}|${memory.moments.length}`);
  const name = `xr-album-pane:${memory.id}`;
  useEffect(() => () => { hovered.delete(name); }, [name]);
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const st = useRef({ t: 0, a: 0, s: 0.97 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    s.t += dt;
    // One orchestrated moment: the panes arrive one after another as the veil lifts.
    const target = s.t < 0.55 + index * 0.08 ? 0 : dim ? 0.32 : 1;
    s.a = damp(s.a, target, target > s.a ? 3.2 : 6, dt);
    s.s = damp(s.s, hovered.has(name) && !dim ? 1.045 : 1, 9, dt);
    if (mat.current) mat.current.opacity = s.a;
    if (group.current) { group.current.visible = s.a > 0.01; group.current.scale.setScalar(s.s); }
  });
  return (
    <group ref={group} position={[x, y, z]} rotation-y={yaw} visible={false}>
      <mesh name={name} geometry={geo} renderOrder={ORDER}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPick(memory); }}
        onPointerOver={(e) => { e.stopPropagation(); hovered.add(name); }} onPointerOut={() => hovered.delete(name)}>
        <meshBasicMaterial ref={mat} map={tex} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------ buttons, in the headset's own style
type ButtonProps = { label: string; x: number; y: number; width?: number; primary?: boolean; small?: boolean; onPress: () => void; name: string; order?: number };
const textSize = (small?: boolean) => (small ? 0.026 : 0.031);
function Button({ label, x, y, width = 0.22, primary = false, small = false, onPress, name, order = ORDER + 6 }: ButtonProps) {
  const geo = useMemo(() => pill(width, small ? 0.066 : 0.078), [width, small]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => { hovered.delete(name); }, [name]);
  const [hover, setHover] = useState(false);
  const fill = primary ? (hover ? '#3b3959' : '#26243d') : hover ? '#ffffff' : '#f4f3f9';
  return (
    <group position={[x, y, 0]} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPress(); }}
      onPointerEnter={() => { setHover(true); hovered.add(name); }} onPointerLeave={() => { setHover(false); hovered.delete(name); }}>
      {/* A hit area a little larger than the pill (hand rays waver); a hit on any part of the button is the button's:
          the handlers sit on the group, so aiming at its words (in front of the pill) presses it too. */}
      <mesh position={[0, 0, -0.001]}><planeGeometry args={[width + 0.06, (small ? 0.066 : 0.078) + 0.05]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} /></mesh>
      <mesh name={name} geometry={geo} renderOrder={order}>
        <meshBasicMaterial color={fill} transparent opacity={primary ? 0.96 : hover ? 0.98 : 0.9} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <Text font={boldUrl} fontSize={textSize(small)} anchorX="center" anchorY="middle" position={[0, 0.001, 0.002]} renderOrder={order + 1}
        color={primary ? '#ffffff' : INK} material-depthTest={false} material-toneMapped={false}>
        {label}
      </Text>
    </group>
  );
}

/** Buttons in a row, centred (widths fit their words). */
function Row({ y, items, order }: { y: number; items: Omit<ButtonProps, 'x' | 'y'>[]; order?: number }) {
  const widths = items.map((b) => b.width ?? Math.max(0.17, 0.07 + b.label.length * textSize(b.small) * 0.56));
  const gap = 0.025;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = -total / 2;
  return (
    <>
      {items.map((b, i) => {
        const cx = x + widths[i]! / 2;
        x += widths[i]! + gap;
        return <Button key={b.name} {...b} width={widths[i]} x={cx} y={y} order={order} />;
      })}
    </>
  );
}

// ------------------------------------------------------------ a memory brought forward
let playing: HTMLAudioElement | null = null;
const stopVoice = () => { playing?.pause(); playing = null; };

/** The page a chosen pane becomes, nearer than the arc, coming toward you as it opens; its buttons beneath it. */
function Forward({ tex, buttons, children }: { tex: THREE.Texture; buttons: Omit<ButtonProps, 'x' | 'y'>[]; children?: ReactNode }) {
  const geo = useMemo(() => roundedPlane(DETAIL_W, DETAIL_H, DETAIL_W * (40 / DETAIL.w)), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const st = useRef({ a: 0, z: 0.12 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    s.a = damp(s.a, 1, 5, dt);
    s.z = damp(s.z, 0, 5, dt);
    if (mat.current) mat.current.opacity = s.a;
    if (group.current) group.current.position.z = -NEAR - s.z; // comes forward toward you as it opens
  });
  return (
    <group ref={group} position={[0, 0.03, -NEAR - 0.12]}>
      <mesh name="xr-album-detail" geometry={geo} renderOrder={ORDER + 4} onClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()} onPointerOver={(e) => e.stopPropagation()}>
        <meshBasicMaterial ref={mat} map={tex} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {children}
      <Row y={-DETAIL_H / 2 - 0.07} items={buttons} order={ORDER + 8} />
    </group>
  );
}

function Detail({ memory, onBack, onStep }: { memory: AlbumMemory; onBack: () => void; onStep: (m: AlbumMemory) => void }) {
  const first = Math.max(0, memory.moments.findIndex((m) => m === coverOf(memory)));
  const [chosen, setChosen] = useState(first);
  const [layout, setLayout] = useState<DetailLayout>({ rows: [], textX: DETAIL.w });
  const [voiceOn, setVoiceOn] = useState(false);
  useEffect(() => { setChosen(first); }, [memory.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopVoice(), [memory.id]);
  const moment = memory.moments[chosen] ?? null;
  const picture = moment?.imageUrl ?? coverOf(memory)?.imageUrl ?? null;
  const tex = usePainted(DETAIL.w, DETAIL.h, async (ctx, alive, commit) => {
    await fontsReady();
    if (!alive()) return;
    const ready = await quick(loadImage(picture), 150);
    setLayout(paintDetail(ctx, memory, chosen, ready ?? null));
    commit();
    if (ready !== undefined) return;
    const img = await loadImage(picture);
    if (!alive() || !img) return;
    setLayout(paintDetail(ctx, memory, chosen, img));
    commit();
  }, `${memory.id}|${chosen}|${picture}`);
  const hear = () => {
    if (voiceOn) { stopVoice(); setVoiceOn(false); return; }
    if (!moment?.audioUrl) return;
    stopVoice();
    const a = new Audio(moment.audioUrl);
    a.onended = () => setVoiceOn(false);
    a.onpause = () => setVoiceOn(false);
    playing = a;
    setVoiceOn(true);
    void a.play().catch(() => setVoiceOn(false));
  };
  const toY = (py: number) => (0.5 - py / DETAIL.h) * DETAIL_H;
  const rowX0 = ((layout.textX - 16) / DETAIL.w - 0.5) * DETAIL_W;
  const buttons: Omit<ButtonProps, 'x' | 'y'>[] = [
    { label: memory.open ? 'Step into it' : 'Visit again', primary: true, name: 'xr-album-step', onPress: () => onStep(memory) },
    ...(moment?.audioUrl ? [{ label: voiceOn ? 'Stop' : 'Hear it again', name: 'xr-album-hear', onPress: hear }] : []),
    { label: 'Back', name: 'xr-album-back', onPress: onBack },
  ];
  return (
    <Forward tex={tex} buttons={buttons}>
      {/* Each moment's words choose that moment (its picture comes up, and its voice when it was kept). */}
      {layout.rows.map((r) => {
        const y0 = toY(r.y0), y1 = toY(r.y1);
        const x1 = DETAIL_W / 2 - 0.02;
        return (
          <mesh key={r.index} name={`xr-album-row:${r.index}`} position={[(rowX0 + x1) / 2, (y0 + y1) / 2, 0.003]} renderOrder={ORDER + 5}
            onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); stopVoice(); setVoiceOn(false); setChosen(r.index); }}>
            <planeGeometry args={[x1 - rowX0, Math.abs(y0 - y1)]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        );
      })}
    </Forward>
  );
}

// ------------------------------------------------------------ San Francisco: memories people shared there
const AT_BRIDGE = SF_MEMORIES.filter((m) => m.crowd);
/** The Golden Gate (where everyone who kept a memory of the bridge stands) and the three made there, then the city's. */
const SF_ROWS: SfMemory[][] = [[GOLDEN_GATE_CROWD, ...AT_BRIDGE], SF_MEMORIES.filter((m) => !m.crowd)];
const SF_TINT = '#9fb6d3';
/** The small copy of a photograph: seven panes of full-size ones are too much for a headset. */
const thumb = (photo: string) => photo.replace('/memories/sf/', '/memories/sf/thumbs/').replace(/\.\w+$/, '.jpg');
const CROWD_LINE = `${countWord(AT_BRIDGE.length).replace(/^./, (c) => c.toUpperCase())} people kept a memory here`;
const isCrowd = (m: SfMemory) => m.id === GOLDEN_GATE_CROWD.id;
/** A shared memory as a pane: its photograph, its name, whose it is and when (fictional samples, marked as such). */
function sfPane(m: SfMemory): AlbumMemory {
  return {
    id: m.id, title: m.title, at: 0, source: 'photo', palette: [SF_TINT], sample: true,
    about: isCrowd(m) ? CROWD_LINE : `${m.owner} · ${m.when}`,
    moments: [{ id: `${m.id}:photo`, memoryId: m.id, memoryTitle: m.title, caption: m.words.join(' '), speaker: 'you', at: 0, imageUrl: thumb(m.photo), sourceUrl: m.photo, audioUrl: null, kind: 'arrival' }],
  };
}
const SF_PANES = new Map(SF_ROWS.flat().map((m) => [m.id, sfPane(m)]));

/** Someone's memory in San Francisco, brought forward: their photograph and everything they said about it. At the
 *  Golden Gate, who you'll find there; you go as yourself and point at anyone to step into theirs. */
function SharedDetail({ memory, onBack, onStep }: { memory: SfMemory; onBack: () => void; onStep: (m: SfMemory) => void }) {
  const crowd = isCrowd(memory);
  const tex = usePainted(DETAIL.w, DETAIL.h, async (ctx, alive, commit) => {
    await fontsReady();
    const people = crowd ? await Promise.all(AT_BRIDGE.map(async (m) => ({ name: m.owner.split(' ')[0]!, img: await loadImage(thumb(m.photo)) }))) : undefined;
    if (!alive()) return;
    const page: SharedPage = {
      title: memory.title, words: memory.words, tint: SF_TINT, people,
      who: crowd ? CROWD_LINE : [memory.owner, SF_PLACES[memory.place]?.name, memory.when].filter(Boolean).join(' · '),
      note: crowd ? 'Fictional samples, made for this demonstration.' : 'A fictional sample, made for this demonstration.',
    };
    // Its pane's small copy at once if the photograph itself isn't here yet (or can't be had), then the photograph.
    const ready = await quick(loadImage(memory.photo), 150);
    if (!alive()) return;
    paintShared(ctx, page, ready ?? (await loadImage(thumb(memory.photo))));
    commit();
    if (ready !== undefined) return;
    const img = await loadImage(memory.photo);
    if (!alive() || !img) return;
    paintShared(ctx, page, img);
    commit();
  }, memory.id);
  return (
    <Forward tex={tex} buttons={[
      { label: crowd ? 'Go to the bridge' : 'Step into it', primary: true, name: 'xr-album-step', onPress: () => onStep(memory) },
      { label: 'Back', name: 'xr-album-back', onPress: onBack },
    ]} />
  );
}

// ------------------------------------------------------------ the album
function Board() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const memories = useAlbum();
  const own = memories.slice(0, MAX_OWN);
  const [picked, setPicked] = useState<string | null>(null);
  const all = useMemo(() => [...memories, ...PREPARED], [memories]);
  const chosen = picked ? all.find((m) => m.id === picked) ?? null : null;
  const shared = picked && !chosen && SF_PANES.has(picked) ? sfMemory(picked) : null;
  const forward = chosen?.id ?? shared?.id ?? null;
  const root = useRef<THREE.Group>(null);
  const dock = useRef<THREE.Group>(null);
  const place = useRef({ frames: 0, placed: false, x: 0, y: 1.5, z: 0, yaw: 0, away: 0, gliding: false });
  const last = useRef<Pose>({ x: 0, y: 0, z: 0, yaw: 0, seen: false });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = root.current;
    if (!g) return;
    const p = place.current;
    const jumped = readHead(camera, last.current);
    const yaw = last.current.yaw;
    p.frames++;
    // Placed a few frames in (once the step to the palace has settled behind the veil), from where you stand and
    // look; placed again if the world is turned to face you after that.
    if ((!p.placed && p.frames > 3) || (p.placed && jumped)) { p.x = _head.x; p.y = _head.y; p.z = _head.z; p.yaw = yaw; p.placed = true; p.away = 0; p.gliding = false; }
    if (!p.placed) { g.visible = false; return; }
    // Never head-locked; but looked away from for a few seconds, it drifts gently back in front.
    const diff = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw));
    p.away = Math.abs(diff) > 1.15 ? p.away + dt : 0;
    if (p.away > 3) p.gliding = true;
    if (p.gliding) {
      const k = 1 - Math.exp(-dt * 1.6);
      p.yaw += diff * k; p.x += (_head.x - p.x) * k; p.z += (_head.z - p.z) * k; p.y += (_head.y - p.y) * k;
      if (Math.abs(diff) < 0.04) p.gliding = false;
    }
    g.visible = true;
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(0, p.yaw, 0);
    // While a memory is brought forward, its own buttons are the ones within reach.
    if (dock.current) dock.current.visible = !forward;
  });

  const step = (m: AlbumMemory) => {
    stopVoice();
    const visit = preparedVisit(m);
    blinkThen(() => {
      setPicked(null);
      if (visit) void flow.visitPlace(visit.key, visit.plan);
      else void flow.revisit(m.id);
    });
  };
  // Into theirs, through their eyes. Back from there comes here again (from someone met at the bridge, to the bridge first).
  const visit = (m: SfMemory) => { stopVoice(); blinkThen(() => { setPicked(null); void flow.visitShared(m.id); }); };
  const again = () => { stopVoice(); blinkThen(() => flow.again()); };
  const home = () => { stopVoice(); blinkThen(() => flow.home()); };
  const leave = () => { stopVoice(); void xrStore.getState().session?.end().catch(() => undefined); };

  // Test hook (Playwright drives the emulated headset): what's shown, and the same actions the buttons take.
  useEffect(() => {
    const w = window as unknown as { __xrAlbum?: unknown };
    w.__xrAlbum = {
      state: () => ({ placed: place.current.placed, own: own.map((m) => m.id), samples: PREPARED.map((m) => m.id), shared: [...SF_PANES.keys()], picked, hovered: [...hovered] }),
      pick: (id: string) => setPicked(id),
      back: () => setPicked(null),
      step: () => { if (chosen) step(chosen); else if (shared) visit(shared); },
      again, home, leave,
      /** Where a named part is, relative to the eyes (camera space), for aiming the emulated controller at it. */
      aim: (name: string) => {
        const o = scene.getObjectByName(name);
        if (!o) return null;
        o.getWorldPosition(_v);
        // The scene camera, not gl.xr.getCamera(): it sits inside the XR origin, so its world matrix carries the
        // origin's turn and offset (the XR array camera has no parent and would drop them).
        camera.updateWorldMatrix(true, false);
        return camera.worldToLocal(_v.clone()).toArray();
      },
    };
    return () => { delete w.__xrAlbum; };
  });

  const ownStep = (OWN_W + GAP) / R, sampleStep = (SAMPLE_W + GAP) / R, sfStep = (SF_W + SF_GAP) / R;
  const onArc = (i: number, n: number, stepA: number) => {
    const t = (i - (n - 1) / 2) * stepA;
    return { x: Math.sin(t) * R, z: -Math.cos(t) * R, yaw: -t };
  };
  const empty = own.length === 0;
  // Two groups side by side on the arc, each turned to its own angle: yours on the left, San Francisco's on the right,
  // as wide as their widest rows (yours at least as wide as its date line), and the pair centred where you look. Their
  // rows line up (with no visits yet, the samples take your visits' row). A chosen pane comes forward in front of its
  // own group.
  const span = (n: number, stepA: number, w: number) => (n - 1) * stepA + w / R;
  const mineW = Math.max(span(own.length, ownStep, OWN_W), span(PREPARED.length, sampleStep, SAMPLE_W), 1.1 / R);
  const cityW = Math.max(...SF_ROWS.map((r) => span(r.length, sfStep, SF_W)));
  const whole = mineW + SPLIT + cityW;
  const mine = (mineW - whole) / 2, city = (whole - cityW) / 2;
  const between = (mine + mineW / 2 + city - cityW / 2) / 2;
  const sampleY = empty ? 0.12 : -0.32;
  const pick = (m: AlbumMemory) => setPicked(m.id);
  return (
    <group ref={root} visible={false}>
      <group rotation-y={-mine}>
        <Text font={serifUrl} fontSize={0.1} anchorX="center" anchorY="bottom" position={[0, 0.42, -R]} renderOrder={ORDER + 1}
          color="#f7f6ff" outlineWidth={0.0025} outlineBlur={0.02} outlineColor="#0b0c1c" outlineOpacity={0.45} material-depthTest={false} material-toneMapped={false}>
          Your moments
        </Text>
        <Text font={sansUrl} fontSize={0.037} anchorX="center" anchorY="top" position={[0, 0.405, -R]} renderOrder={ORDER + 1}
          color="#f7f6ff" outlineWidth={0.003} outlineBlur={0.014} outlineColor="#0b0c1c" outlineOpacity={0.7} material-depthTest={false} material-toneMapped={false}>
          {empty ? `${todayLine()}. Your first visit will be kept here.` : `${todayLine()}. ${summaryLine(memories)}`}
        </Text>
        <Text font={boldUrl} fontSize={0.035} anchorX="center" anchorY="bottom" position={[0, empty ? 0.295 : -0.11, -R]} renderOrder={ORDER + 1}
          color="#f7f6ff" outlineWidth={0.003} outlineBlur={0.014} outlineColor="#0b0c1c" outlineOpacity={0.7} material-depthTest={false} material-toneMapped={false}>
          Samples to step into
        </Text>
        {own.map((m, i) => {
          const a = onArc(i, own.length, ownStep);
          return <Pane key={m.id} memory={m} w={OWN_W} x={a.x} y={0.12} z={a.z} yaw={a.yaw} index={i} dim={!!forward && forward !== m.id} onPick={pick} />;
        })}
        {PREPARED.map((m, i) => {
          const a = onArc(i, PREPARED.length, sampleStep);
          return <Pane key={m.id} memory={m} w={SAMPLE_W} x={a.x} y={sampleY} z={a.z} yaw={a.yaw} index={own.length + i} dim={!!forward && forward !== m.id} onPick={pick} />;
        })}
        {chosen && <Detail key={chosen.id} memory={chosen} onBack={() => { stopVoice(); setPicked(null); }} onStep={step} />}
      </group>
      <group rotation-y={-city}>
        <Text font={serifUrl} fontSize={0.1} anchorX="center" anchorY="bottom" position={[0, 0.42, -R]} renderOrder={ORDER + 1}
          color="#f7f6ff" outlineWidth={0.0025} outlineBlur={0.02} outlineColor="#0b0c1c" outlineOpacity={0.45} material-depthTest={false} material-toneMapped={false}>
          San Francisco
        </Text>
        <Text font={sansUrl} fontSize={0.037} anchorX="center" anchorY="top" position={[0, 0.405, -R]} renderOrder={ORDER + 1}
          color="#f7f6ff" outlineWidth={0.003} outlineBlur={0.014} outlineColor="#0b0c1c" outlineOpacity={0.7} material-depthTest={false} material-toneMapped={false}>
          Memories people shared here
        </Text>
        <Text font={boldUrl} fontSize={0.035} anchorX="center" anchorY="bottom" position={[0, -0.11, -R]} renderOrder={ORDER + 1}
          color="#f7f6ff" outlineWidth={0.003} outlineBlur={0.014} outlineColor="#0b0c1c" outlineOpacity={0.7} material-depthTest={false} material-toneMapped={false}>
          Around the city
        </Text>
        {SF_ROWS.map((row, r) => row.map((m, i) => {
          const a = onArc(i, row.length, sfStep);
          const index = own.length + PREPARED.length + (r ? SF_ROWS[0]!.length : 0) + i;
          return <Pane key={m.id} memory={SF_PANES.get(m.id)!} w={SF_W} x={a.x} y={r ? -0.32 : 0.12} z={a.z} yaw={a.yaw} index={index} dim={!!forward && forward !== m.id} titleLines={2} onPick={pick} />;
        }))}
        {shared && <SharedDetail key={shared.id} memory={shared} onBack={() => setPicked(null)} onStep={visit} />}
      </group>
      {/* Between the two and below both: wider than the space between them, so under their lowest rows. */}
      <group rotation-y={-between}>
        <group ref={dock} position={[0, 0, -R + 0.02]}>
          <Row y={-0.57} items={[
            { label: 'Visit another memory', primary: true, name: 'xr-album-again', onPress: again },
            { label: 'Back to the start', small: true, name: 'xr-album-home', onPress: home },
            { label: 'Leave headset', small: true, name: 'xr-album-leave', onPress: leave },
          ]} />
        </group>
      </group>
    </group>
  );
}

// ------------------------------------------------------------ back at the start, in the headset
function Start() {
  const camera = useThree((s) => s.camera);
  const root = useRef<THREE.Group>(null);
  const st = useRef({ frames: 0, placed: false });
  const last = useRef<Pose>({ x: 0, y: 0, z: 0, yaw: 0, seen: false });
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const s = st.current;
    const jumped = readHead(camera, last.current);
    s.frames++;
    // A few frames in (the step back to the shore has settled behind the veil), and again if the world turns to you.
    if ((!s.placed && s.frames > 3) || (s.placed && jumped)) {
      g.position.copy(_head);
      g.rotation.set(0, last.current.yaw, 0);
      s.placed = true;
    }
    g.visible = s.placed;
  });
  const begin = () => void flow.begin();
  const album = () => blinkThen(() => flow.openAlbum());
  const leave = () => void xrStore.getState().session?.end().catch(() => undefined);
  useEffect(() => {
    const w = window as unknown as { __xrStart?: unknown };
    w.__xrStart = { placed: () => st.current.placed, begin, album, leave };
    return () => { delete w.__xrStart; };
  });
  return (
    <group ref={root} visible={false}>
      <group position={[0, -0.05, -1.5]}>
        <Text font={serifUrl} fontSize={0.075} anchorX="center" anchorY="bottom" position={[0, 0.06, 0]} renderOrder={ORDER + 1}
          color="#f7f6ff" outlineWidth={0.002} outlineBlur={0.016} outlineColor="#0b0c1c" outlineOpacity={0.45} material-depthTest={false} material-toneMapped={false}>
          Visit a place you remember
        </Text>
        <Row y={-0.02} items={[
          { label: 'Begin', primary: true, name: 'xr-start-begin', onPress: begin },
          { label: 'Your moments', name: 'xr-start-album', onPress: album },
          { label: 'Leave headset', small: true, name: 'xr-start-leave', onPress: leave },
        ]} />
      </group>
    </group>
  );
}

/** Everything the album is, in the headset (mounted by XrLayer while presenting). */
export function XrAlbum() {
  const presenting = useXR((s) => s.session != null);
  const stage = useGate((s) => s.stage);
  // Entering the headset at the start begins the visit at once; the start's own buttons are only for coming back to it.
  const [returned, setReturned] = useState(false);
  const prev = useRef<string | null>(null);
  useEffect(() => { prev.current = null; setReturned(false); }, [presenting]);
  useEffect(() => {
    if (stage !== 'portal') setReturned(false);
    else if (prev.current !== null && prev.current !== 'portal') setReturned(true);
    prev.current = stage;
  }, [stage]);
  if (!presenting) return null;
  return (
    <>
      <Veil />
      {stage === 'album' && <Suspense fallback={null}><Board /></Suspense>}
      {stage === 'portal' && returned && <Suspense fallback={null}><Start /></Suspense>}
    </>
  );
}
