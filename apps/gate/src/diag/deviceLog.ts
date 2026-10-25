// A headset can't show its console. On a headset browser (or with ?diag=1) this page reports what went wrong, and
// a short heartbeat of where the visit is, to the server that served it (/__device-log, written to .logs/devices.log
// on the computer running the demo). Nothing personal is sent: no words, no audio, no room codes.
const ON = /OculusBrowser|Quest|Pico/i.test(navigator.userAgent) || new URLSearchParams(location.search).get('diag') === '1';
const device = `${/OculusBrowser/i.test(navigator.userAgent) ? 'quest' : 'browser'}-${Math.random().toString(36).slice(2, 6)}`;
let sent = 0;

function send(kind: string, detail: Record<string, unknown>) {
  if (!ON || sent > 400) return;
  sent++;
  const body = JSON.stringify({ device, kind, at: new Date().toISOString(), ...detail }).slice(0, 4000);
  try {
    if (!navigator.sendBeacon?.('/__device-log', new Blob([body], { type: 'text/plain' }))) {
      void fetch('/__device-log', { method: 'POST', body, keepalive: true }).catch(() => undefined);
    }
  } catch { /* reporting must never break the visit */ }
}

export function reportDevice(kind: string, detail: Record<string, unknown> = {}) { send(kind, detail); }

if (ON) {
  addEventListener('error', (e) => send('error', { message: String(e.message).slice(0, 400), where: `${e.filename?.split('/').pop()}:${e.lineno}:${e.colno}`, stack: String((e.error as Error | undefined)?.stack ?? '').slice(0, 1500) }));
  addEventListener('unhandledrejection', (e) => send('rejection', { reason: String((e.reason as Error | undefined)?.stack ?? e.reason).slice(0, 1500) }));
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      send(level, { message: args.map((a) => (a instanceof Error ? `${a.message} ${a.stack ?? ''}` : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ').slice(0, 1200) });
    };
  }
  send('open', { ua: navigator.userAgent.slice(0, 200), xr: 'xr' in navigator, screen: `${screen.width}x${screen.height}@${devicePixelRatio}` });
  // Every few seconds: the stage, whether the headset session is on, the voice, frames drawn and the audio state.
  let lastFrames = 0;
  setInterval(() => {
    const w = window as unknown as { __gate?: { store: { getState: () => Record<string, unknown> } }; __gateFrames?: number; __gateAudio?: () => string };
    const g = w.__gate?.store.getState();
    const frames = w.__gateFrames ?? 0;
    send('beat', { stage: g?.stage, xr: g?.xr, voice: g?.voice, music: g?.musicOn, framesPerBeat: frames - lastFrames, audio: w.__gateAudio?.() ?? null, hidden: document.hidden });
    lastFrames = frames;
  }, 5000);
}
