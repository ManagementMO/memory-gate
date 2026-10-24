import { useCallback, useEffect, useRef, useState } from 'react';
import { useConvex, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { createVoice, type Voice, type VoiceState } from '../../../headset/src/voice';
import { newCommandId } from '../ids';
import type { Session } from '../session';
import { problemOf } from '../errors';
import { Notice, useToast } from '../ui';

/** The phone uses the same streaming recognizer, recording consent and upload path as the headset. */
export function StoryRecorder({ session, allowed, recordingAllowed, paused, onConsent }: {
  session: Session; allowed: boolean; recordingAllowed: boolean; paused: boolean; onConsent: () => void;
}) {
  const client = useConvex();
  const add = useMutation(api.utterances.add);
  const toast = useToast();
  const voice = useRef<Voice | null>(null);
  const generation = useRef(0);
  const held = useRef(false);
  const finishing = useRef(false);
  const cap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [message, setMessage] = useState('');
  const secure = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  const disconnect = useCallback(() => {
    generation.current++;
    held.current = false;
    finishing.current = false;
    if (cap.current) clearTimeout(cap.current);
    cap.current = null;
    voice.current?.dispose();
    voice.current = null;
    setReady(false); setConnecting(false); setState('idle');
  }, []);

  useEffect(() => {
    const leave = () => { if (document.visibilityState === 'hidden') disconnect(); };
    const blur = () => disconnect();
    document.addEventListener('visibilitychange', leave);
    window.addEventListener('pagehide', blur);
    return () => {
      document.removeEventListener('visibilitychange', leave);
      window.removeEventListener('pagehide', blur);
      disconnect();
    };
  }, [disconnect]);
  useEffect(() => { if (!allowed || paused) disconnect(); }, [allowed, paused, disconnect]);

  async function enable() {
    disconnect();
    const id = generation.current;
    setMessage(''); setConnecting(true);
    const v = createVoice({ client, api, code: session.code, token: session.token,
      onState: s => { if (generation.current === id) setState(s); },
      onError: text => { if (generation.current === id) setMessage(text); },
    });
    voice.current = v;
    await v.ready;
    if (generation.current !== id) return;
    setConnecting(false);
    setReady(v.mode === 'live');
    if (v.mode !== 'live') { v.dispose(); voice.current = null; setMessage('Speech is unavailable right now. You can still type below.'); }
  }

  async function stopAndShare() {
    const v = voice.current;
    if (!v || !held.current || finishing.current) return;
    held.current = false; finishing.current = true;
    if (cap.current) clearTimeout(cap.current);
    cap.current = null;
    const id = generation.current;
    setState('thinking');
    try {
      const result = await v.stop();
      if (generation.current !== id) return;
      if (!result.transcript.trim()) { setMessage('Nothing was heard. Try a longer sentence, or type it below.'); return; }
      await add({ code: session.code, token: session.token, transcript: result.transcript, source: 'stt',
        durationMs: result.durationMs, commandId: newCommandId(),
        ...(result.audioFileId ? { audioFileId: result.audioFileId as Id<'_storage'> } : {}),
      });
      if (generation.current === id) toast.say('Your words are in the shared story. Review any suggested changes.', 'ok');
    } catch (error) {
      if (generation.current === id) toast.report(problemOf(error));
    } finally {
      if (generation.current === id) { finishing.current = false; setState('idle'); }
    }
  }

  function toggle() {
    if (held.current) { void stopAndShare(); return; }
    if (!voice.current || finishing.current) return;
    held.current = true; setMessage(''); setState('listening');
    void voice.current.start();
    cap.current = setTimeout(() => { void stopAndShare(); }, 40_000);
  }

  return <section className="card compact recorder" data-testid="story-recorder" data-state={state} aria-label="Speak a memory">
    <div className="section-head"><h2 className="h3">Let them tell it</h2><span className="chip chip-soft">Original voice</span></div>
    <p className="muted small">Speak a memory or a placement correction. Your words appear on every screen; a suggestion needs confirmation.</p>
    {!allowed ? <Notice tone="warn">Voice needs permission. <button className="btn btn-quiet" onClick={onConsent}>Open Permissions</button></Notice>
      : !secure ? <Notice tone="warn" testId="recorder-insecure">To use the phone microphone on Wi-Fi, open <a href={`https://${window.location.hostname}:5174${window.location.pathname}${window.location.search}`}>the secure phone page</a> and accept the local development certificate. Typing works here.</Notice>
      : <div className="row wrap">
        {!ready ? <button type="button" className="btn btn-primary" data-testid="voice-enable" onClick={enable} disabled={connecting || paused}>
          {connecting ? 'Connecting microphone…' : 'Enable microphone'}
        </button> : <>
          <button type="button" className={`btn btn-primary recorder-button ${state === 'listening' ? 'is-recording' : ''}`} data-testid="voice-record"
            aria-pressed={state === 'listening'} onClick={toggle} disabled={paused || state === 'thinking'}>
            <span aria-hidden="true">{state === 'listening' ? '■' : '●'}</span> {state === 'listening' ? 'Stop and share' : state === 'thinking' ? 'Saving your words…' : 'Record a memory'}
          </button>
          <button type="button" className="btn btn-quiet" data-testid="voice-disconnect" onClick={disconnect}>Cancel / turn mic off</button>
        </>}
      </div>}
    <p className="muted small">{recordingAllowed ? 'With your permission, the original recording is kept for replay.' : 'Only the words are kept. Enable recording in Permissions to keep the original voice.'} Each turn ends after 40 seconds.</p>
    {state === 'listening' && <p className="recording-status" role="status">Listening · tap Stop and share when you finish.</p>}
    {message && <p className="muted small" role="status" data-testid="voice-message">{message}</p>}
  </section>;
}
