// The 2D page around the splat preview: room code entry, title, microphone, Enter the memory, desktop
// push-to-talk and the typed fallback, plus plain-language errors. Nothing here is shown inside the headset.
import { normalizeCode } from './net.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type Ui = ReturnType<typeof createUi>;
export type TickerItem = { kind: string; at: number; meta: string; lead?: string; text: string; sub?: string | null };

export function createUi() {
  const head = $('mg-head'), title = $('mg-title'), sub = $('mg-sub');
  const panel = $('mg-panel'), status = $('mg-status'), loading = $('mg-loading');
  const mic = $<HTMLButtonElement>('mg-mic'), enter = $<HTMLButtonElement>('mg-enter'), talk = $<HTMLButtonElement>('mg-talk');
  const typedForm = $<HTMLFormElement>('mg-typed'), typedInput = $<HTMLInputElement>('mg-typed-input');
  const err = $('mg-error'), errText = $('mg-error-text');
  let errTimer: ReturnType<typeof setTimeout> | null = null;
  $('mg-error-close').addEventListener('click', () => err.classList.add('mg-hidden'));

  return {
    mic, enter, talk, typedForm, typedInput,
    /** Resolves with a valid 6-character code typed by the person. */
    askForCode(initialError?: string): Promise<string> {
      const join = $('mg-join'), form = $<HTMLFormElement>('mg-join-form'), input = $<HTMLInputElement>('mg-join-code'), fe = $('mg-join-error');
      join.classList.remove('mg-hidden');
      fe.textContent = initialError ?? '';
      try { const last = localStorage.getItem('mg.lastCode'); if (last && !input.value) input.value = normalizeCode(last); } catch { /* no storage */ }
      setTimeout(() => input.focus(), 50);
      input.oninput = () => { input.value = normalizeCode(input.value); fe.textContent = ''; };
      return new Promise((resolve) => {
        form.onsubmit = (e) => {
          e.preventDefault();
          const code = normalizeCode(input.value);
          if (code.length !== 6) { fe.textContent = 'The code has 6 letters and numbers, like ABC234.'; input.focus(); return; }
          join.classList.add('mg-hidden');
          resolve(code);
        };
      });
    },
    showRoom(t: string) {
      title.textContent = t;
      document.title = `${t} · Memory Gate`;
      head.classList.remove('mg-hidden');
      panel.classList.remove('mg-hidden');
    },
    setSub(html: string) { sub.innerHTML = html; },
    setStatus(text: string) { status.textContent = text; },
    setLoading(on: boolean, text?: string) {
      if (text) loading.textContent = text;
      loading.classList.toggle('mg-hidden', !on);
    },
    /** In XR the 2D page is not seen; keep the emulator view clean too. */
    setPresenting(p: boolean) {
      for (const el of [head, panel]) el.style.visibility = p ? 'hidden' : '';
    },
    error(msg: string, ms = 9000) {
      errText.textContent = msg;
      err.classList.remove('mg-hidden');
      if (errTimer) clearTimeout(errTimer);
      if (ms > 0) errTimer = setTimeout(() => err.classList.add('mg-hidden'), ms);
    },
    clearError() { err.classList.add('mg-hidden'); },
    setTalkHeld(h: boolean) { talk.classList.toggle('held', h); talk.textContent = h ? 'Listening… let go to send' : 'Hold to talk'; },
    setMic(state: 'off' | 'asking' | 'on' | 'blocked') {
      mic.disabled = state === 'asking'; // stays clickable when on: a click (a user gesture) also starts the voice
      mic.classList.toggle('done', state === 'on');
      mic.textContent = state === 'on' ? 'Microphone on ✓' : state === 'asking' ? 'Asking for the microphone…' : state === 'blocked' ? 'Microphone blocked: allow it in the browser' : 'Enable microphone';
    },
    setEnterReady(ready: boolean, label?: string) { enter.disabled = !ready; if (label) enter.textContent = label; },
    /** Spectator (projector) view: no controls, just the corner tag, the story ticker and an optional sound button. */
    setSpectator() {
      document.body.classList.add('mg-spectator');
      $('mg-tag').textContent = 'Memory Gate · live · sample content';
      $('mg-ticker').classList.remove('mg-hidden');
    },
    /** Up to three story items, newest first. Text is set with textContent (transcripts are data, never HTML). */
    setTicker(items: TickerItem[]) {
      const box = $('mg-ticker');
      box.replaceChildren(...items.slice(0, 3).map((it) => {
        const row = document.createElement('div');
        row.className = 'mg-tick';
        row.dataset.kind = it.kind;
        const dot = document.createElement('span'); dot.className = 'dot';
        const body = document.createElement('div');
        const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = it.meta;
        const text = document.createElement('div'); text.className = 'text';
        if (it.lead) { const b = document.createElement('b'); b.textContent = it.lead; text.append(b, it.text ? ` · ${it.text}` : ''); }
        else text.textContent = it.text;
        body.append(meta, text);
        if (it.sub) { const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = it.sub; body.append(sub); }
        row.append(dot, body);
        return row;
      }));
      box.classList.toggle('mg-hidden', items.length === 0);
    },
    showSoundButton(onClick: () => void) {
      const b = $<HTMLButtonElement>('mg-sound');
      b.classList.remove('mg-hidden');
      b.onclick = () => { onClick(); b.textContent = 'Sound on ✓'; b.disabled = true; };
    },
  };
}
