// "The proposal on the hill" (?story=proposal): the world memory showcased in San Francisco's World memories. A copy
// of the Red Kite meadow without its kite and without the two family figures: Daniel and Sofia (a fictional sample)
// stand in the clearing, and you can walk around them as on the Red Kite page. A copy: it reads the Red Kite's meadow,
// walking surface and touch pad as they are and changes nothing of the Red Kite page (its view is copied, ProposalView).
// Only static files (the cached meadow, its walking surface, the couple), so it opens without the backend.
// ?shot=ring|oak frames the album's pictures (album-pictures.mjs proposal).
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneCanvas } from '../scene/SceneCanvas';
import { xrStore } from '../scene/xr';
import { Meadow, type MeadowSource } from '../red-kite/Meadow';
import { initialTransition } from '../red-kite/motion';
import { Terrain } from '../red-kite/Terrain';
import { TouchPad } from '../red-kite/TouchPad';
import type { MeadowTraversal } from '../red-kite/traversal';
import { COUPLE_SPOT, ProposalCouple } from './ProposalCouple';
import { ProposalView } from './ProposalView';
import { PROPOSAL } from './story';
import '../red-kite/story.css';
import './proposal.css';

/** The cached meadow at full detail, calibrated as fixtures/worlds/red-kite.json records it. */
const MEADOW: MeadowSource = { url: '/red-kite/meadow-full.spz', liteUrl: null, floorY: -0.5775501930381995, scale: 2.6397884 };
const EYE = -MEADOW.floorY! * MEADOW.scale;
const shot = new URLSearchParams(location.search).get('shot');


export default function ProposalExperience() {
  const [worldReady, setWorldReady] = useState(false), [terrainReady, setTerrainReady] = useState(false), [coupleReady, setCoupleReady] = useState(false);
  const [error, setError] = useState(''), [xr, setXR] = useState(false), [supported, setSupported] = useState(false);
  const [line, setLine] = useState(0);
  const ready = worldReady && terrainReady && coupleReady;
  const transition = useRef(initialTransition('elena'));
  const traversal = useRef<MeadowTraversal | null>(null), touch = useRef({ right: 0, forward: 0 });
  const navigationBlocked = useRef(true), recenter = useRef(0), debugTerrain = useRef(false);
  const reduced = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches);
  useLayoutEffect(() => { navigationBlocked.current = !ready; }, [ready]);
  useEffect(() => { let live = true; navigator.xr?.isSessionSupported('immersive-vr').then((v) => { if (live) setSupported(v); }).catch(() => undefined); return () => { live = false; }; }, []);

  const onWorld = useCallback((r: boolean) => setWorldReady(r), []);
  const onTerrain = useCallback((world: MeadowTraversal | null) => { traversal.current = world; setTerrainReady(!!world); }, []);
  const onXR = useCallback((p: boolean) => { setXR(p); setSupported((v) => p || v); }, []);
  const onError = useCallback((s: string) => setError(s), []);
  /** R (or the button) fades back to where you arrived on the path. */
  const home = useCallback(() => { recenter.current++; transition.current = { ...transition.current, target: 'elena', phase: 'out' }; }, []);
  const word = PROPOSAL.words[line]!;

  return (
    <main className={`red-kite app proposal${xr ? ' rk-in-xr' : ''}`} data-testid="proposal-experience" data-world-ready={String(ready)} data-ui={shot ? 'hidden' : 'visible'}>
      <SceneCanvas effects={false}>
        <ProposalView transition={transition} eye={EYE} navigationBlocked={navigationBlocked} recenter={recenter} traversal={traversal} touch={touch} onHome={home} onXR={onXR} />
        {/* The meadow at its own floor, where its splats' ground really is; Terrain lifts the walking surface onto it (as in
            the Gate's meadow, social/scene/Walking.tsx). Shifting the meadow too would bury the couple about 1.15 m deep. */}
        <Meadow source={MEADOW} lite={false} detailed verticalShift={0} onReady={onWorld} onError={onError} />
        <hemisphereLight args={['#f5e6ca', '#6b7252', 2.2]} />
        <directionalLight position={[-6, 8, 2]} color="#ffe1ab" intensity={2.4} />
        <Suspense fallback={null}>
          <Terrain source={MEADOW} debug={debugTerrain} onReady={onTerrain} onError={onError} />
          <ProposalCouple traversal={traversal} reduced={reduced} onReady={setCoupleReady} />
        </Suspense>
        <Diagnostics ready={ready} />
        {(shot === 'path' || shot === 'ring' || shot === 'oak') && <Shot kind={shot} />}
      </SceneCanvas>
      <div className="rk-vignette" aria-hidden="true" />
      <header className="rk-header">
        <a className="rk-wordmark" href="/" aria-label="Return to Memora">memora<span>/</span></a>
        <div><p className="rk-eyebrow">World memories · San Francisco, CA</p><h1>{PROPOSAL.title}<span>Shared publicly by {PROPOSAL.owners}</span></h1></div>
        <span className="rk-sample">Fictional sample</span>
        <div className="rk-top-actions"><a className="pm-back" href="/" aria-label="Back to World memories" data-testid="proposal-back"><span>World memories</span></a></div>
      </header>
      <section className="rk-story pm-words" aria-label={`${PROPOSAL.owners}, in their own words`}>
        <div className="rk-source-heading"><p className="rk-eyebrow">{word.who}<span>{line + 1} / {PROPOSAL.words.length}</span></p></div>
        <blockquote key={line} data-testid="proposal-quote">{word.quote}</blockquote>
        <p className="rk-source-note">Written for this sample. No real couple's words or likeness.</p>
        <div className="rk-story-actions">
          <button data-testid="proposal-home" onClick={home} disabled={!ready}>Back to the path · R</button>
          <button className="rk-next" data-testid="proposal-next" onClick={() => setLine((i) => (i + 1) % PROPOSAL.words.length)}>
            {line + 1 < PROPOSAL.words.length ? 'Next' : 'From the start'} <span>→</span>
          </button>
        </div>
      </section>
      <TouchPad input={touch} disabled={!ready || xr} />
      <footer className="rk-footer">
        <div><span className="rk-controls-hint">Drag to look · WASD to walk · Shift to run · Space to jump</span></div>
        <div>{(supported || new URLSearchParams(location.search).get('emulate') === '1') && <button className="rk-enter" data-testid="enter-vr" disabled={!ready} onClick={() => { void xrStore.enterVR().catch((e) => setError(String(e).slice(0, 180))); }}>Enter Quest VR ↗</button>}</div>
      </footer>
      {(!ready || error) && <div className="rk-notice" role="status" data-testid="proposal-notice">{error || 'Opening the hill…'}{error && <button onClick={() => location.reload()}>Try again</button>}</div>}
    </main>
  );
}

/** For the checks: whether the place and the couple are showing, and where the couple stands. */
function Diagnostics({ ready }: { ready: boolean }) {
  const scene = useThree((s) => s.scene), camera = useThree((s) => s.camera), frames = useRef(0);
  useFrame(() => { frames.current++; });
  useEffect(() => {
    const w = window as unknown as { __proposal?: unknown };
    w.__proposal = { ready: () => ready, frames: () => frames.current, camera: () => camera.position.toArray(), couple: () => scene.getObjectByName('ProposalCouple')?.getWorldPosition(new THREE.Vector3()).toArray() ?? null };
    return () => { delete w.__proposal; };
  }, [ready, scene, camera]);
  return null;
}

/** The album's pictures, framed after the walking view each frame: the two of them under the oak seen from the path
 *  (higher in the frame than the arrival view, clear of the album's caption), the open ring box seen from beside her,
 *  and the two of them from the far side of the clearing, the hills and the sea behind them. */
function Shot({ kind }: { kind: 'path' | 'ring' | 'oak' }) {
  const camera = useThree((s) => s.camera), scene = useThree((s) => s.scene);
  const at = useRef(new THREE.Vector3());
  useFrame(() => {
    if (kind === 'ring') {
      const box = scene.getObjectByName('RingBox');
      if (!box) return;
      box.getWorldPosition(at.current);
      camera.position.set(at.current.x + 0.62, at.current.y + 0.22, at.current.z + 0.55);
      camera.lookAt(at.current.x - 0.12, at.current.y + 0.18, at.current.z);
    } else {
      const couple = scene.getObjectByName('ProposalCouple');
      const ground = couple ? couple.getWorldPosition(at.current).y : 0;
      const from: [number, number, number] = kind === 'path' ? [-0.1, 1.5, 2.2] : [0.5, 1.45, -3.1];
      camera.position.set(COUPLE_SPOT.x + from[0], ground + from[1], COUPLE_SPOT.z + from[2]);
      camera.lookAt(COUPLE_SPOT.x + 0.45, ground + (kind === 'path' ? 0.55 : 0.85), COUPLE_SPOT.z);
    }
  }, -1);
  return null;
}
