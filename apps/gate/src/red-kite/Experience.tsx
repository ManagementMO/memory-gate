import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../../../convex/_generated/api';
import { RED_KITE_TELLINGS, type Perspective } from '../../../../packages/shared/src/redKite';
import { SceneCanvas } from '../scene/SceneCanvas';
import { xrStore } from '../scene/xr';
import { Meadow, type MeadowSource } from './Meadow';
import { MemoryProps } from './props';
import { beginSwitch, cancelSwitch, initialMotion, initialTransition, releaseSpool } from './motion';
import { openKiteSession, type KiteSession } from './session';
import { StoryView, type SceneControls } from './StoryScene';
import './story.css';

class StoryBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(e: unknown) { return { error: String(e) }; }
  componentDidCatch() { window.speechSynthesis?.cancel(); void xrStore.getState().session?.end().catch(() => undefined); }
  render() {
    if (this.state.error) return <main className="rk-failure"><p className="rk-eyebrow">The Red Kite</p><h1>We couldn’t open this story.</h1><p role="alert">{this.state.error.slice(0, 250)}</p><button onClick={() => location.reload()}>Try again</button><a href="/">Return to the gate</a></main>;
    return this.props.children;
  }
}
export default function RedKiteExperience() { return <StoryBoundary><Experience /></StoryBoundary>; }

function Experience() {
  const [session, setSession] = useState<KiteSession | null>(null), [error, setError] = useState('');
  const [perspective, setPerspective] = useState<Perspective>('elena'), [worldReady, setWorldReady] = useState(false), [propsReady, setPropsReady] = useState(false);
  const [xr, setXR] = useState(false), [supported, setSupported] = useState(false), [localPause, setLocalPause] = useState(false);
  const [compare, setCompare] = useState(false), [busy, setBusy] = useState(false), [speaking, setSpeaking] = useState(false), [switching, setSwitching] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const connected = useConvexConnectionState().isWebSocketConnected && online;
  const [lite, setLite] = useState(() => {
    const choice = new URLSearchParams(location.search).get('lite');
    // Actual stereo review showed a substantial quality loss in the 100k export. Keep it opt-in.
    return choice === '1';
  });
  const transition = useRef(initialTransition('elena')), motion = useRef(initialMotion()), inFlight = useRef(false), speechEpoch = useRef(0);
  const stopSpeech = useCallback(() => { speechEpoch.current++; window.speechSynthesis?.cancel(); setSpeaking(false); }, []);
  const onReady = useCallback(() => { setWorldReady(true); setError(''); }, []), onPropsReady = useCallback(() => setPropsReady(true), []);
  const onError = useCallback((s: string) => setError(s), []), onXR = useCallback((p: boolean) => { setXR(p); setSupported(v => p || v); }, []);
  const selected = useCallback((p: Perspective) => {
    setPerspective(p);
    if (session) { try { sessionStorage.setItem(`mg.red-kite.view.${session.code}`, p); } catch { /* optional local preference */ } }
  }, [session]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener('online', update); addEventListener('offline', update);
    return () => { removeEventListener('online', update); removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    let live = true;
    openKiteSession().then(s => {
      if (!live) return;
      let p: Perspective = 'elena';
      try { if (sessionStorage.getItem(`mg.red-kite.view.${s.code}`) === 'rosa') p = 'rosa'; } catch { /* default */ }
      transition.current = initialTransition(p); setPerspective(p); setSession(s);
    }).catch(e => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, []);
  useEffect(() => { let live = true; navigator.xr?.isSessionSupported('immersive-vr').then(v => { if (live) setSupported(v); }).catch(() => undefined); return () => { live = false; }; }, []);
  const auth = session ? { code: session.code, token: session.token } : null;
  const room = useQuery(api.rooms.get, auth ?? 'skip'), data = useQuery(api.redKite.current, auth ?? 'skip');
  const advance = useMutation(api.redKite.advance), choose = useMutation(api.redKite.choose), reset = useMutation(api.redKite.reset), setPaused = useMutation(api.rooms.setPaused);
  const telling = data?.tellings.find(t => t.key === perspective), line = telling?.lines[telling.beat];
  const paused = localPause || !!data?.paused, ready = worldReady && propsReady;
  const canWrite = !!data?.canAuthor && ready && connected && !paused && !busy && !switching;
  const decision = telling?.decisions.find(d => d.beat === telling.beat)?.decision;
  const source = room?.splat as MeadowSource | null | undefined;
  const look = telling?.look ?? { visible: false, color: null, ribbon: null };
  const proposal = !!line?.proposal && !decision;
  const quiet = paused || switching || !connected;
  const simulationPaused = useRef(true), viewPaused = useRef(true);
  // DOM and Canvas have separate React roots. A frame reads these guards directly, so rest cannot
  // keep animating while an expensive Canvas commit is still catching up with the visible controls.
  useLayoutEffect(() => { simulationPaused.current = quiet; viewPaused.current = paused || !connected; }, [quiet, paused, connected]);
  useEffect(() => { if (quiet) { stopSpeech(); motion.current = releaseSpool(motion.current); } }, [quiet, stopSpeech]);
  useEffect(() => {
    if (paused || !connected) { transition.current = cancelSwitch(transition.current); setSwitching(false); }
  }, [paused, connected]);
  useEffect(() => { stopSpeech(); }, [perspective, telling?.beat, stopSpeech]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { stopSpeech(); setLocalPause(true); } };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); speechEpoch.current++; window.speechSynthesis?.cancel(); };
  }, [stopSpeech]);
  useEffect(() => {
    if (!switching) return;
    const timer = setInterval(() => { if (transition.current.phase === 'idle') setSwitching(false); }, 60);
    return () => clearInterval(timer);
  }, [switching]);
  async function run(fn: () => Promise<unknown>) {
    if (inFlight.current || !connected || paused) return;
    inFlight.current = true; setBusy(true); setError(''); stopSpeech();
    try { await fn(); } catch (e) { setError(String(e).slice(0, 250)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function switchTo(p: Perspective) {
    if (!ready || paused || !connected || switching || p === perspective) return;
    stopSpeech(); motion.current = releaseSpool(motion.current);
    simulationPaused.current = true;
    transition.current = beginSwitch(transition.current, p, false); setSwitching(true); setCompare(false);
  }
  function next() {
    if (!auth || !telling || !canWrite || telling.beat >= telling.lines.length - 1) return;
    void run(() => advance({ ...auth, perspective, baseRevision: telling.revision, commandId: crypto.randomUUID() }));
  }
  function pick(decision: 'use' | 'leave') {
    if (!auth || !telling || !line?.proposal || !canWrite) return;
    void run(() => choose({ ...auth, perspective, decision, baseRevision: telling.revision, commandId: crypto.randomUUID() }));
  }
  function rest() {
    if (data?.paused && !data.canAuthor) return;
    stopSpeech(); motion.current = releaseSpool(motion.current);
    simulationPaused.current = !paused || !connected || switching; viewPaused.current = !paused || !connected;
    if (data?.canAuthor && auth && connected) {
      const desired = !paused; setLocalPause(desired);
      // Rest must not be dropped merely because an illustration write is already in flight.
      void setPaused({ ...auth, paused: desired, commandId: crypto.randomUUID() }).catch(e => setError(String(e).slice(0, 250)));
    } else if (!data?.paused) setLocalPause(p => !p);
  }
  function breeze() {
    if (quiet || !look.visible) return;
    motion.current.breeze = 1; motion.current.lifts++;
  }
  function play() {
    if (!line || quiet || !window.speechSynthesis) return;
    if (speaking) { stopSpeech(); return; }
    stopSpeech(); const epoch = speechEpoch.current;
    const u = new SpeechSynthesisUtterance(line.quote); u.lang = 'en-US'; u.rate = .86; u.pitch = perspective === 'elena' ? .95 : 1.08;
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    if (voices.length) u.voice = voices[perspective === 'elena' ? 0 : Math.min(1, voices.length - 1)]!;
    u.onstart = () => { if (epoch !== speechEpoch.current) { speechSynthesis.cancel(); return; } setSpeaking(true); };
    u.onend = u.onerror = () => { if (epoch === speechEpoch.current) setSpeaking(false); };
    setSpeaking(true); speechSynthesis.speak(u);
  }
  const onKeepsake = useCallback(() => setCompare(true), []);
  const both = data?.tellings.map(t => `${t.name}: ${t.look.visible ? (t.look.color ?? 'color open') + (t.look.ribbon ? ', cream ribbon' : '') : 'details open'}.`).join(' ') ?? '';
  const controls: SceneControls = { title: compare ? 'Both tellings · fictional sample' : `${telling?.name ?? 'The Red Kite'} · fictional sample`, quote: paused ? 'Take your time. The meadow can wait.' : compare ? `${both} Neither replaces the other.` : line?.quote ?? 'Opening the meadow…', paused,
    locked: quiet || busy || !ready, canAdvance: !!data?.canAuthor && !!telling && telling.beat < telling.lines.length - 1,
    proposal: !!line?.proposal && !!data?.canAuthor, onNext: next, onSwitch: () => switchTo(perspective === 'elena' ? 'rosa' : 'elena'), onRest: rest, onUse: () => pick('use'), onLeave: () => pick('leave'), onPlay: play, onBreeze: breeze, onCompare: () => setCompare(v => !v) };
  const share = () => {
    if (!session) return;
    const url = new URL(location.href); url.search = ''; url.searchParams.set('story', 'red-kite'); url.searchParams.set('room', session.code);
    void navigator.clipboard?.writeText(url.toString()).then(() => setError('Viewer link copied. They can explore without changing the story.')).catch(() => setError('Copy the room code to open a viewer: ' + session.code));
  };
  return <main className={`red-kite app${xr ? ' rk-in-xr' : ''}`} data-testid="red-kite-experience" data-perspective={perspective} data-paused={String(paused)} data-speaking={String(speaking)} data-world-ready={String(ready)}>
    {source?.url && <SceneCanvas effects={false}>
      <StoryView transition={transition} motion={motion} eye={source.floorY === null ? 1.5246 : -source.floorY * source.scale} paused={viewPaused} controls={controls} onPerspective={selected} onXR={onXR} />
      <Meadow source={source} lite={lite} onReady={onReady} onError={onError} />
      <Suspense fallback={null}><MemoryProps look={look} proposed={proposal} paused={simulationPaused} motion={motion} onKeepsake={onKeepsake} onReady={onPropsReady} /></Suspense>
    </SceneCanvas>}
    <div className="rk-vignette" aria-hidden="true" />
    <header className="rk-header">
      <a className="rk-wordmark" href="/" aria-label="Return to Memory Gate">gate<span>/</span></a>
      <div><p className="rk-eyebrow">One afternoon. Two tellings.</p><h1>The Red Kite<span>California, a long time ago</span></h1></div>
      <span className="rk-sample">Fictional sample</span>
      <div className="rk-top-actions"><button onClick={share} disabled={!session}>Invite a viewer</button><button data-testid="rest" onClick={rest} disabled={!ready || (data?.paused && !data.canAuthor)}>{paused ? 'Continue' : 'Rest a moment'}</button></div>
    </header>
    <nav className="rk-perspectives" aria-label="Choose whose telling to explore">
      {(['elena', 'rosa'] as const).map(key => <button key={key} data-testid={`perspective-${key}`} aria-pressed={perspective === key} disabled={!ready || paused || switching || !connected} onClick={() => switchTo(key)}>
        <span className="rk-person-initial">{key === 'elena' ? 'E' : 'R'}</span><span><strong>{RED_KITE_TELLINGS[key].name}</strong><small>{RED_KITE_TELLINGS[key].place}</small></span><span className="rk-view-marker" aria-hidden="true">{perspective === key ? '●' : '↗'}</span>
      </button>)}
    </nav>
    <p className="rk-place-note">{perspective === 'elena' ? 'The whole sky ahead.' : 'Her friend in the sunlight.'}<span>AI interpretation · each telling keeps its own details</span></p>
    <div className="rk-visual-status" aria-live="polite" data-testid="visual-status">{look.visible ? `${telling?.name}’s illustration · ${look.color ?? 'color left open'}${look.ribbon ? ' · cream ribbon' : ''}` : proposal ? 'A possibility, waiting for a choice' : 'The place is here. The details can take their time.'}</div>
    <section className="rk-story" aria-label={`${telling?.name ?? 'Story'}’s source line`}>
      <div className="rk-source-heading"><p className="rk-eyebrow">{telling?.name ?? 'Opening the story'}<span>{telling ? `${telling.beat + 1} / ${telling.lines.length}` : '…'}</span></p><button className="rk-listen" data-testid="sample-play" onClick={play} disabled={!ready || quiet || !line} aria-label={speaking ? 'Stop sample voice' : 'Play synthetic sample voice'}>{speaking ? '■ Stop voice' : '▷ Sample voice'}</button></div>
      <blockquote key={`${perspective}-${telling?.beat}`} data-testid="story-quote">{paused ? 'Take your time. The meadow can wait.' : line?.quote ?? 'Opening a familiar kind of afternoon…'}</blockquote>
      <p className="rk-source-note">{paused ? 'Voice, story changes and animated props are resting.' : line?.note}</p>
      {line && <details className="rk-source"><summary>Read the source behind this scene</summary><p><strong>{telling!.name} · fictional sample, line {telling!.beat + 1}</strong><br />{line.quote}</p><p>Written demonstration text. Sample playback is a computer voice; no family recording is attached.</p><code>{line.sourceId}</code></details>}
      {line?.proposal && <div className="rk-choice" data-testid="illustration-choice"><p>{decision === 'use' ? 'Chosen for this telling’s illustration.' : decision === 'leave' ? 'Left open in this telling.' : 'Let this description take shape?'}</p>{data?.canAuthor && <div><button className="rk-primary" data-testid="use-look" disabled={!canWrite} onClick={() => pick('use')}>{decision === 'use' ? '✓ Using this look' : 'Use this look'}</button><button data-testid="leave-open" disabled={!canWrite} onClick={() => pick('leave')}>Leave it open</button></div>}</div>}
      <div className="rk-story-actions"><button data-testid="compare" onClick={() => setCompare(v => !v)} disabled={!data}>Both tellings <span>↗</span></button>{telling && telling.beat < telling.lines.length - 1 ? <button className="rk-next" data-testid="next-line" disabled={!canWrite} onClick={next}>{data?.canAuthor ? 'Next line' : 'Waiting for the host'} <span>→</span></button> : <button className="rk-next" onClick={() => { setCompare(true); }} disabled={!ready}>Keep both tellings <span>↗</span></button>}</div>
    </section>
    {paused && <div className="rk-resting" role="status">A moment to rest<span>The afternoon will still be here.</span></div>}
    {switching && <div className="rk-switching" role="status">Stepping into {transition.current.target === 'elena' ? 'Elena' : 'Rosa'}’s telling…</div>}
    {compare && <aside className="rk-comparison" aria-label="Both attributed tellings"><div className="rk-comparison-title"><div><p className="rk-eyebrow">A keepsake with room for both</p><h2>Different things stayed.</h2></div><button data-testid="close-compare" onClick={() => setCompare(false)} aria-label="Close both tellings">×</button></div>
      <p>The same kite, the same afternoon. Each person’s words stay with their illustration.</p>
      <div className="rk-compare-grid">{data?.tellings.map(t => <article key={t.key} data-testid={`compare-${t.key}`}><p className="rk-eyebrow">{t.name}<span>{t.place}</span></p><strong>{t.look.visible ? `${t.look.color ?? 'Color open'}${t.look.ribbon ? ' · cream ribbon' : ''}` : 'Details still open'}</strong><blockquote>{t.lines[Math.min(t.beat, t.lines.length - 1)]?.quote}</blockquote><details><summary>All of {t.name}’s source lines</summary>{t.lines.map((l, i) => <p key={l.sourceId}><b>{i + 1}.</b> {l.quote}</p>)}</details><button onClick={() => switchTo(t.key)} disabled={t.key === perspective || paused || switching || !connected}>Explore {t.name}’s telling ↗</button></article>)}</div>
      <p className="rk-compare-footnote">An illustration can be changed or left open. Neither telling has to replace the other.</p>
    </aside>}
    <button className="rk-mobile-rest" data-testid="mobile-rest" onClick={rest} disabled={!ready || (data?.paused && !data.canAuthor)}>{paused ? 'Continue' : 'Rest'}</button>
    <footer className="rk-footer"><div><button data-testid="catch-breeze" onClick={breeze} disabled={!ready || quiet || !look.visible}>⌁ Catch the breeze</button><span>Or lift the wooden spool.</span></div><div><label className="rk-quality"><input type="checkbox" checked={lite} onChange={e => { setWorldReady(false); setLite(e.target.checked); }} />Lighter meadow</label>{(supported || new URLSearchParams(location.search).get('emulate') === '1') && <button className="rk-enter" data-testid="enter-vr" disabled={!ready} onClick={() => { stopSpeech(); void xrStore.enterVR().catch(e => setError(String(e).slice(0, 180))); }}>Enter Quest VR ↗</button>}{data?.canReset && <button className="rk-reset" data-testid="restart-story" disabled={!canWrite} onClick={() => { if (auth) void run(() => reset({ ...auth, commandId: crypto.randomUUID() })); }}>Start the sample again</button>}</div></footer>
    {(!ready || !connected || error) && <div className="rk-notice" role="status" data-testid="story-notice">{error || (!connected ? 'Reconnecting. Story changes are waiting.' : 'Opening the meadow and its little keepsakes…')}{error && !session && <button onClick={() => location.reload()}>Try again</button>}</div>}
  </main>;
}
