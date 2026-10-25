import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { XROrigin, useXR, useXRInputSourceState } from '@react-three/xr';
import { Suspense, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import fontUrl from '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff?url';
import type { Perspective } from '../../../../packages/shared/src/redKite';
import { stepTransition, type MotionState, type Transition } from './motion';
import { VIEWPOINTS, viewpointYaw } from './viewpoints';
import { initialNavigation, lookAround, stepNavigation, type WalkInput } from './navigation';
import type { MeadowTraversal } from './traversal';
import { xrStore } from '../scene/xr';
import { GroundStep } from './GroundStep';
import { MEMORY_OBJECTS, type MemoryObject } from './memory-lens';
import { sourceMediaUrl, type XRSource } from '../memory-objects/types';

export type SceneControls = {
  title: string; quote: string; paused: boolean; locked: boolean; canAdvance: boolean; canBreeze: boolean; proposal: boolean;
  onNext: () => void; onSwitch: () => void; onRest: () => void; onUse: () => void; onLeave: () => void; onPlay: () => void; onBreeze: () => void; onCompare: () => void; onHome: () => void;
  sourcesOpen: boolean; photo: XRSource | null; sourceCount: number; sourceIndex: number; sourceActionLabel?: string;
  onSources: () => void; onSourcesClose: () => void; onSourceNext: () => void;
};
function Button3D({ label, action, x, y, onClick, disabled = false, width = .34, height = .095 }: { label: string; action: string; x: number; y: number; onClick: () => void; disabled?: boolean; width?: number; height?: number }) {
  return <group position={[x, y, .012]} userData={{ redKiteAction: action }} onClick={e => { e.stopPropagation(); if (!disabled) onClick(); }}>
    <mesh renderOrder={1001}><planeGeometry args={[width, height]} /><meshBasicMaterial color={disabled ? '#8f9486' : '#ede7d5'} transparent depthWrite={false} depthTest={false} /></mesh>
    <Text renderOrder={1002} material-depthTest={false} font={fontUrl} fontSize={height < .07 ? .021 : .026} color="#26362d" maxWidth={width - .03} anchorX="center" anchorY="middle" position-z={.004}>{label}</Text>
  </group>;
}
function NativeControls({ controls: c }: { controls: SceneControls }) {
  const right = useXRInputSourceState('controller', 'right'), left = useXRInputSourceState('controller', 'left');
  const previous = useRef<Record<string, boolean>>({});
  useFrame(() => {
    const edge = (key: string, pressed: boolean) => { const fire = pressed && !previous.current[key]; previous.current[key] = pressed; return fire; };
    const pressed = (src: typeof right, key: string) => src?.gamepad?.[key]?.state === 'pressed';
    if (edge('a', pressed(right, 'a-button')) && !c.locked) { if (c.sourcesOpen) c.onSourceNext(); else if (c.canAdvance) c.onNext(); }
    if (edge('b', pressed(right, 'b-button'))) c.onRest();
    if (edge('x', pressed(left, 'x-button')) && !c.locked) c.onSwitch();
    if (edge('home', pressed(left, 'xr-standard-thumbstick')) && !c.locked) c.onHome();
    if (edge('y', pressed(left, 'y-button'))) void xrStore.getState().session?.end();
  });
  if (c.sourcesOpen) return <NativeSources controls={c} />;
  return <group name="RedKiteControls" position={[.43, .91, -1.65]} scale={.84}>
    {/* Composite the readable panel after the transparent splats; the transition mask remains last. */}
    <mesh renderOrder={1000} position-z={-.008}><planeGeometry args={[1.16, .72]} /><meshBasicMaterial color="#172c24" transparent opacity={.83} depthWrite={false} depthTest={false} /></mesh>
    <Text renderOrder={1002} material-depthTest={false} font={fontUrl} fontSize={.032} color="#ecd4a0" position={[0, .28, .002]} maxWidth={1.05} onClick={e => { e.stopPropagation(); if (!c.locked) c.onPlay(); }}>{c.title + ' · ▷ voice'}</Text>
    <Text renderOrder={1002} material-depthTest={false} font={fontUrl} fontSize={.037} lineHeight={1.25} color="#f5f0df" maxWidth={1.04} textAlign="center" anchorY="top" position={[0, .22, .002]}>{c.quote}</Text>
    <Button3D action="switch" label="Other telling · X" x={-.38} y={-.11} onClick={c.onSwitch} disabled={c.locked} />
    <Button3D action="rest" label={c.paused ? 'Continue · B' : 'Rest · B'} x={0} y={-.11} onClick={c.onRest} />
    <Button3D action="next" label="Next line · A" x={.38} y={-.11} onClick={c.onNext} disabled={c.locked || !c.canAdvance} />
    <Button3D action="use" label={c.proposal ? 'Use this look' : 'Both tellings'} x={-.38} y={-.24} onClick={c.proposal ? c.onUse : c.onCompare} disabled={c.locked} />
    <Button3D action="leave" label={c.proposal ? 'Leave it open' : 'Photo sources'} x={0} y={-.24} onClick={c.proposal ? c.onLeave : c.onSources} disabled={c.locked} />
    <Button3D action="breeze" label="Catch the breeze" x={.38} y={-.24} onClick={c.onBreeze} disabled={c.locked || !c.canBreeze} />
    <Button3D action="home" label="Return · left stick" x={-.28} y={-.325} width={.51} height={.052} onClick={c.onHome} disabled={c.locked} />
    <Button3D action="exit" label="Leave headset · Y" x={.28} y={-.325} width={.51} height={.052} onClick={() => { void xrStore.getState().session?.end(); }} />
  </group>;
}

/** Draws inside the actual XR scene; DOM dialogs are disabled in immersive VR. */
export type NativeSourceControls = Pick<SceneControls, 'photo' | 'sourceIndex' | 'sourceCount' | 'paused' | 'locked' | 'onSourcesClose' | 'onSourceNext' | 'onRest' | 'sourceActionLabel'>;
export function NativeSources({ controls: c, anchor = [0, 1.16, -1.65] }: { controls: NativeSourceControls; anchor?: [number, number, number] }) {
  const p = c.photo;
  const object = p ? MEMORY_OBJECTS[p.objectKey as MemoryObject] : null;
  return <group position={anchor} name="MemorySourcePanel" userData={{ sourceId: p?._id ?? null }}>
    <mesh position-z={-.008}><planeGeometry args={[1.16, 1.32]} /><meshBasicMaterial color="#23392f" /></mesh>
    <Text font={fontUrl} fontSize={.032} color="#ecd4a0" position={[0, .58, .003]} maxWidth={1.04}>{p ? `${p.title ?? object?.label ?? 'Memory'} · source ${c.sourceIndex + 1} / ${c.sourceCount}` : 'Memory · photo sources'}</Text>
    {p?.imageUrl && <SourcePhoto key={p.imageUrl} url={p.imageUrl} />}
    {p && !p.imageUrl && <Text font={fontUrl} fontSize={.044} maxWidth={.96} textAlign="center" position={[0, .30, .004]} color="#f5f0df">{p.owner}</Text>}
    <Text font={fontUrl} fontSize={.026} color="#ecd4a0" maxWidth={1.04} textAlign="center" position={[0, .035, .004]}>{p ? (p.execution === 'fixture' ? 'Fictional example' : p.sourceKind === 'place' ? 'Google Maps · place reference' : p.execution === 'family-upload' ? `Family photo · ${p.owner}` : `Public post · @${p.owner}`) : 'A photo can be a conversation starter.'}</Text>
    <Text font={fontUrl} fontSize={.029} color="#f5f0df" maxWidth={1.03} textAlign="center" anchorY="top" position={[0, -.025, .004]}>{c.paused ? 'Take your time. The meadow can wait.' : p ? (p.note ? 'Family note: ' + p.note.slice(0, 200) : 'Post caption: ' + p.caption.slice(0, 200)) : 'Ask family to review a photo on the phone or laptop, then attach it to this kite and this perspective.'}</Text>
    <Text font={fontUrl} fontSize={.023} color="#d1d7c2" maxWidth={1.04} textAlign="center" position={[0, -.39, .004]}>{object?.invitation ?? 'What comes to mind? You can leave it open.'}</Text>
    <Button3D action="source-close" label="Back to the story" x={-.38} y={-.49} onClick={c.onSourcesClose} />
    <Button3D action="source-next" label={c.sourceActionLabel ?? 'Next photo · A'} x={0} y={-.49} onClick={c.onSourceNext} disabled={c.locked || (!c.sourceActionLabel && c.sourceCount < 2)} />
    <Button3D action="source-rest" label={c.paused ? 'Continue · B' : 'Rest · B'} x={.38} y={-.49} onClick={c.onRest} />
    <Text font={fontUrl} fontSize={.021} color="#d1d7c2" position={[0, -.59, .004]}>A source supports a conversation; it does not prove a recollection.</Text>
  </group>;
}
function SourcePhoto({ url }: { url: string }) {
  const [photo, setPhoto] = useState<{ texture: THREE.CanvasTexture; aspect: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true, texture: THREE.CanvasTexture | undefined;
    setPhoto(null); setFailed(false); const img = new Image(); img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (!live || !img.naturalWidth || !img.naturalHeight) return;
      try {
      const scale = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext('2d'); if (!context) { setFailed(true); return; }
      context.drawImage(img, 0, 0, canvas.width, canvas.height); texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      setPhoto({ texture, aspect: img.naturalWidth / img.naturalHeight });
      } catch { if (live) setFailed(true); }
    };
    img.onerror = () => { if (live) setFailed(true); };
    img.src = sourceMediaUrl(url) ?? '';
    return () => { live = false; img.onload = null; img.onerror = null; img.src = ''; texture?.dispose(); };
  }, [url]);
  const width = photo ? Math.min(.86, .39 * photo.aspect) : .6, height = photo ? width / photo.aspect : .35;
  // Loading changes the shader from an untextured placeholder to USE_MAP. Recreate just
  // the material so Three compiles that variant; assigning map alone can leave a white quad.
  return <group position={[0, .30, .004]}><mesh name="MemorySourcePhoto"><planeGeometry args={[width, height]} /><meshBasicMaterial key={photo?.texture.uuid ?? 'loading'} map={photo?.texture ?? null} color={photo ? '#ffffff' : '#51664d'} toneMapped={false} /></mesh>{!photo && <Text font={fontUrl} fontSize={.025} maxWidth={.55} textAlign="center" position-z={.004}>{failed ? 'Photo unavailable. The source note is kept.' : 'Opening photo…'}</Text>}</group>;
}

export function StoryView({ transition, motion, eye, paused, navigationBlocked, recenter, reduced, traversal, touch, controls, onPerspective, onXR }: {
  transition: RefObject<Transition>; motion: RefObject<MotionState>; eye: number; paused: RefObject<boolean>; controls: SceneControls;
  navigationBlocked: RefObject<boolean>; recenter: RefObject<number>; reduced: RefObject<boolean>;
  traversal: RefObject<MeadowTraversal | null>; touch: RefObject<WalkInput>;
  onPerspective: (key: Perspective) => void; onXR: (presenting: boolean) => void;
}) {
  const camera = useThree(s => s.camera), gl = useThree(s => s.gl), scene = useThree(s => s.scene);
  const presenting = useXR(s => s.session != null);
  const left = useXRInputSourceState('controller', 'left'), right = useXRInputSourceState('controller', 'right');
  const origin = useRef<THREE.Group>(null), mask = useRef<THREE.Mesh>(null), maskMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const head = useRef(new THREE.Vector3()), frames = useRef(0), previous = useRef(transition.current.current);
  const navigation = useRef(initialNavigation()), keys = useRef(new Set<string>());
  const jump = useRef(false), physicsSeen = useRef<MeadowTraversal | null>(null), controlsRef = useRef(controls);
  useLayoutEffect(() => { controlsRef.current = controls; }, [controls]);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const centered = useRef(recenter.current), wasXR = useRef(false), pivot = useRef(new THREE.Vector2());
  const localHead = useRef(new THREE.Vector3()), rotation = useRef(new THREE.Quaternion()), angles = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  // Seated wearers: their eyes are measured over the first moments in the headset, and the floor rises so they see
  // the meadow from the story's standing eye line rather than from knee height (as the Gate's perspectives do).
  const seated = useRef({ samples: [] as number[], since: 0, lift: 0, done: false });
  const moves = useRef<{ from: Perspective; to: Perspective; opacity: number; frame: number }[]>([]);
  useEffect(() => { onXR(presenting); }, [presenting, onXR]);
  useEffect(() => {
    const canvas = gl.domElement, previousTabIndex = canvas.getAttribute('tabindex'), previousLabel = canvas.getAttribute('aria-label');
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Explore the meadow. Drag to look; W A S D or arrow keys to walk; Shift to run; Space to jump; R to return to the story.');
    const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest('button, input, textarea, select, summary, a, [contenteditable="true"]');
    const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyR']);
    const keydown = (e: KeyboardEvent) => {
      if (!movement.has(e.code) || e.ctrlKey || e.metaKey || e.altKey || editable(e.target) || navigationBlocked.current || gl.xr.isPresenting) return;
      e.preventDefault();
      if (e.code === 'KeyR') { if (!e.repeat) controlsRef.current.onHome(); return; }
      if (e.code === 'Space') { if (!e.repeat) jump.current = true; return; }
      keys.current.add(e.code);
    };
    const keyup = (e: KeyboardEvent) => keys.current.delete(e.code);
    const endDrag = () => {
      const current = drag.current; drag.current = null;
      if (current) { try { canvas.releasePointerCapture(current.id); } catch { /* already released */ } }
    };
    const clear = () => { keys.current.clear(); jump.current = false; endDrag(); };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || navigationBlocked.current || gl.xr.isPresenting) return;
      canvas.focus({ preventScroll: true });
      if (drag.current || motion.current.held) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (document.pointerLockElement === canvas) return;
      const current = drag.current;
      if (!current || e.pointerId !== current.id) return;
      // The actual R3F prop capture wins over camera looking, independent of listener order.
      if (motion.current.held) { drag.current = null; return; }
      if (navigationBlocked.current || gl.xr.isPresenting) { endDrag(); return; }
      navigation.current = lookAround(navigation.current, e.clientX - current.x, e.clientY - current.y);
      current.x = e.clientX; current.y = e.clientY;
    };
    const up = (e: PointerEvent) => { if (drag.current?.id === e.pointerId) endDrag(); };
    const hidden = () => { if (document.hidden) clear(); };
    const lockedMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas && !navigationBlocked.current && !gl.xr.isPresenting) navigation.current = lookAround(navigation.current, e.movementX, e.movementY);
    };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    addEventListener('keydown', keydown); addEventListener('keyup', keyup); addEventListener('blur', clear);
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('mousemove', lockedMove);
    return () => {
      clear(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
      removeEventListener('keydown', keydown); removeEventListener('keyup', keyup); removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('mousemove', lockedMove);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (previousTabIndex === null) canvas.removeAttribute('tabindex'); else canvas.setAttribute('tabindex', previousTabIndex);
      if (previousLabel === null) canvas.removeAttribute('aria-label'); else canvas.setAttribute('aria-label', previousLabel);
    };
  }, [gl, motion, navigationBlocked]);
  useEffect(() => {
    const mapping = gl.toneMapping, background = scene.background;
    gl.toneMapping = THREE.NoToneMapping; scene.background = new THREE.Color('#a9bdc7');
    return () => { gl.toneMapping = mapping; scene.background = background; };
  }, [gl, scene]);
  useEffect(() => {
    const diagnostic = { emulator: () => new URLSearchParams(location.search).get('emulate') === '1' ? xrStore.getState().emulator : undefined,
      snapshot: () => ({ selected: transition.current.current, phase: transition.current.phase, fade: transition.current.opacity,
      camera: camera.position.toArray(), origin: origin.current?.position.toArray(), yaw: origin.current?.rotation.y,
      viewDirection: camera.getWorldDirection(new THREE.Vector3()).toArray(), navigation: { ...navigation.current },
      motionMode: reduced.current ? 'reduced' : 'full', physics: 'critically damped tether springs',
      meadow: { ...scene.getObjectByName('RedKiteMeadow')?.userData },
      traversal: traversal.current ? { engine: 'Rapier 0.21', feet: traversal.current.feet, grounded: traversal.current.grounded, triangles: traversal.current.triangles, verticalShift: traversal.current.verticalShift, distance: traversal.current.distance, edgeBlocked: traversal.current.edgeBlocked } : null,
      nativeButtons: Object.fromEntries((scene.getObjectByName('RedKiteControls')?.children ?? []).filter(o => o.userData.redKiteAction).map(o => [o.userData.redKiteAction, o.getWorldPosition(new THREE.Vector3()).toArray()])),
      spoolScreen: new THREE.Vector3(...motion.current.spool).project(camera).toArray(), kite: scene.getObjectByName('RedKiteKite')?.position.toArray(),
      propsResting: scene.getObjectByName('RedKiteSpool')?.userData.resting,
      kiteRotation: scene.getObjectByName('RedKiteKite')?.rotation.toArray().slice(0, 3),
      tailRotation: scene.getObjectByName('Tail_08')?.rotation.toArray().slice(0, 3),
      xr: gl.xr.isPresenting, frames: frames.current, held: motion.current.held !== null, spool: [...motion.current.spool],
      sourcePanel: scene.getObjectByName('MemorySourcePanel')?.userData ?? null,
      sourcePhotoReady: !!((scene.getObjectByName('MemorySourcePhoto') as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial | undefined)?.map,
      simulationTime: motion.current.time, breeze: motion.current.breeze, grabs: motion.current.grabs, lifts: motion.current.lifts,
      spoolVelocity: [...motion.current.spoolVelocity], kiteLift: motion.current.kiteLift, kiteLiftVelocity: motion.current.kiteLiftVelocity,
      boxLidAngle: scene.getObjectByName('LidPivot')?.rotation.x,
      moves: [...moves.current], inputSources: xrStore.getState().inputSourceStates.map(s => ({ type: s.type, hand: s.inputSource.handedness })) }) };
    const w = window as unknown as { __redKite3D?: typeof diagnostic }; w.__redKite3D = diagnostic;
    return () => { if (w.__redKite3D === diagnostic) delete w.__redKite3D; };
  }, [camera, gl, motion, transition, scene, reduced, traversal]);
  useFrame((_, dt) => {
    frames.current++;
    transition.current = stepTransition(transition.current, dt, paused.current);
    const t = transition.current, p = VIEWPOINTS[t.current];
    if (previous.current !== t.current || (centered.current !== recenter.current && t.phase === 'covered') || wasXR.current !== gl.xr.isPresenting || physicsSeen.current !== traversal.current) {
      navigation.current = initialNavigation(); pivot.current.set(0, 0); keys.current.clear(); drag.current = null;
      if (wasXR.current !== gl.xr.isPresenting) seated.current = { samples: [], since: 0, lift: 0, done: false };
      centered.current = recenter.current; wasXR.current = gl.xr.isPresenting;
      traversal.current?.place(p.feet); physicsSeen.current = traversal.current;
    }
    if (camera instanceof THREE.PerspectiveCamera && camera.far !== 1000) { camera.far = 1000; camera.fov = 78; camera.updateProjectionMatrix(); }
    const baseYaw = viewpointYaw(p), oldYaw = baseYaw + navigation.current.yaw;
    const l = left?.gamepad?.['xr-standard-thumbstick'], r = right?.gamepad?.['xr-standard-thumbstick'];
    const isDown = (a: string, b: string) => keys.current.has(a) || keys.current.has(b) ? 1 : 0;
    camera.getWorldQuaternion(rotation.current); const headYaw = angles.current.setFromQuaternion(rotation.current, 'YXZ').y;
    const before = navigation.current;
    const blocked = navigationBlocked.current || t.phase !== 'idle';
    navigation.current = stepNavigation(before, {
      right: gl.xr.isPresenting ? l?.xAxis ?? 0 : touch.current.right + isDown('KeyD', 'ArrowRight') - isDown('KeyA', 'ArrowLeft'),
      forward: gl.xr.isPresenting ? -(l?.yAxis ?? 0) : touch.current.forward + isDown('KeyW', 'ArrowUp') - isDown('KeyS', 'ArrowDown'),
      heading: gl.xr.isPresenting ? headYaw : oldYaw, turn: gl.xr.isPresenting ? r?.xAxis ?? 0 : 0,
      speed: gl.xr.isPresenting ? 1.2 : (keys.current.has('ShiftLeft') || keys.current.has('ShiftRight')) ? 3.2 : 1.8,
    }, dt, blocked);
    if (traversal.current) {
      const desired = navigation.current;
      const feet = traversal.current.step([desired.x - before.x, desired.z - before.z], dt, jump.current, blocked);
      navigation.current = { ...desired, x: feet[0] - p.feet[0], y: feet[1], z: feet[2] - p.feet[2] };
    }
    jump.current = false;
    const n = navigation.current, yaw = baseYaw + n.yaw;
    if (origin.current) {
      if (gl.xr.isPresenting && yaw !== oldYaw) {
        camera.getWorldPosition(localHead.current); origin.current.worldToLocal(localHead.current);
        const { x, z } = localHead.current;
        // Snap about the wearer's tracked head, not the middle of their physical play space.
        pivot.current.x += Math.cos(oldYaw) * x + Math.sin(oldYaw) * z - Math.cos(yaw) * x - Math.sin(yaw) * z;
        pivot.current.y += -Math.sin(oldYaw) * x + Math.cos(oldYaw) * z + Math.sin(yaw) * x - Math.cos(yaw) * z;
      }
      const sit = seated.current;
      if (gl.xr.isPresenting && !sit.done) {
        camera.getWorldPosition(localHead.current); origin.current.worldToLocal(localHead.current);
        if (localHead.current.y > .3) { sit.samples.push(localHead.current.y); sit.since += dt; }
        if (sit.since >= 1.5) {
          const measured = [...sit.samples].sort((a, b) => a - b)[sit.samples.length >> 1] ?? eye;
          sit.lift = measured < eye - .15 ? Math.min(.9, eye - measured) : 0; sit.done = true;
        }
      }
      origin.current.position.set(p.feet[0] + n.x + pivot.current.x, n.y + sit.lift, p.feet[2] + n.z + pivot.current.y);
      origin.current.rotation.y = yaw;
    }
    if (!gl.xr.isPresenting) {
      camera.position.set(p.feet[0] + n.x, n.y + eye, p.feet[2] + n.z);
      const pitch = Math.atan2(p.target[1] - p.feet[1] - eye, Math.hypot(p.target[0] - p.feet[0], p.target[2] - p.feet[2]));
      camera.rotation.set(Math.max(-1.25, Math.min(1.25, pitch + n.pitch)), yaw, 0, 'YXZ');
    }
    if (previous.current !== t.current) { moves.current = [...moves.current.slice(-7), { from: previous.current, to: t.current, opacity: t.opacity, frame: frames.current }]; previous.current = t.current; onPerspective(t.current); }
    camera.getWorldPosition(head.current);
    if (mask.current) { mask.current.position.copy(head.current); mask.current.visible = t.opacity > 0; }
    if (maskMaterial.current) maskMaterial.current.opacity = t.opacity;
  }, -2);
  return <>
    <XROrigin ref={origin}>{presenting && <Suspense fallback={null}><NativeControls controls={controls} /></Suspense>}</XROrigin>
    <GroundStep traversal={traversal} blocked={navigationBlocked} />
    {/* A real scene mask covers both XR eyes; a DOM fade alone is invisible in immersive VR. */}
    <mesh ref={mask} renderOrder={100000} frustumCulled={false} visible={false} raycast={() => null}>
      <sphereGeometry args={[.18, 16, 12]} />
      <meshBasicMaterial ref={maskMaterial} color="black" side={THREE.BackSide} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  </>;
}
