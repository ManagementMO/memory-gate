const $ = (id) => document.getElementById(id);
const lines = [
  { id: 'fictional-01', text: 'Rosa and I used to run down that little path. There was an old oak at the bend.' },
  { id: 'fictional-02', text: "We had a kite. I can't remember its color." },
  { id: 'fictional-03', text: 'It was red. Rosa tied a cream ribbon to the tail.' },
  { id: 'fictional-04', text: "I don't remember what we did after. I remember we didn't want to go home." },
];
const uncertain = { id: 'fictional-uncertain', text: "I don't remember whether we brought a kite that day." };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const fresh = () => ({ beat: 0, scenario: 'story', identity: 'absent', identitySource: null, color: null,
  ribbon: null, detailSource: null, proposal: null, choices: [], paused: false, flying: false, held: false,
  simulationSeconds: 0, sampleSpeech: 'idle' });
let state = fresh();
let speechEpoch = 0;
let pointerId = null;
let spool = { x: 895, y: 677 };
const dock = { x: 895, y: 677 };
const overlay = $('world-overlay');
const snapshot = () => JSON.parse(JSON.stringify({ ...state, reducedMotion: reduced.matches,
  spool: { x: Math.round(spool.x), y: Math.round(spool.y) },
  evidenceKind: 'fictional local 2D rehearsal; no live server, original family audio or native XR input' }));
Object.defineProperty(window, '__redKite', { value: Object.freeze({ snapshot }), writable: false });
const currentLine = () => state.scenario === 'uncertain' ? uncertain : lines[state.beat];

function stopSpeech() {
  speechEpoch += 1;
  window.speechSynthesis?.cancel();
  state.sampleSpeech = 'idle';
  $('audio-status').textContent = 'Optional browser voice; this is not an original family recording.';
}

function releasePointer() {
  if (pointerId !== null && $('spool-handle').hasPointerCapture(pointerId)) $('spool-handle').releasePointerCapture(pointerId);
  pointerId = null;
  state.held = false;
}

function setPaused(paused) {
  stopSpeech();
  releasePointer();
  state.paused = paused;
  if (paused) spool = { ...dock };
  render();
}

function loadBeat(beat) {
  if (state.paused) return;
  stopSpeech();
  state.beat = beat;
  state.proposal = beat === 1 ? 'identity' : beat === 2 ? 'details' : null;
  if (beat === 1 && state.identity === 'absent') state.identity = 'proposed';
  if (beat === 2 && state.identity === 'absent') state.identity = 'proposed';
  render();
}

function accept() {
  if (state.paused || !state.proposal) return;
  const kind = state.proposal;
  state.identity = 'accepted';
  state.identitySource ||= kind === 'identity' ? lines[1].id : lines[2].id;
  if (kind === 'details') {
    state.color = 'red';
    state.ribbon = 'cream';
    state.detailSource = lines[2].id;
  }
  state.choices.push({ sourceId: currentLine().id, action: 'use-this-look', scope: kind, meaning: 'illustration choice, not historical verification' });
  state.proposal = null;
  render();
}

function leaveOpen() {
  if (state.paused || !state.proposal) return;
  state.choices.push({ sourceId: currentLine().id, action: 'leave-open', scope: state.proposal });
  if (state.identity === 'proposed') state.identity = 'absent';
  state.proposal = null;
  render();
}

function breeze() {
  if (state.paused || state.identity !== 'accepted') return;
  state.flying = !state.flying;
  render();
}

function render() {
  const line = currentLine();
  const visible = state.identity !== 'absent';
  const accepted = state.identity === 'accepted';
  $('source-quote').textContent = line.text;
  $('source-index').textContent = state.scenario === 'uncertain' ? 'Alternate sample' : `Sample line ${state.beat + 1} of ${lines.length}`;
  $('source-note').textContent = `Fictional sample · ${line.id} · no original family recording`;
  $('next').disabled = state.paused || state.scenario === 'uncertain' || state.beat === lines.length - 1;
  $('next').textContent = state.beat === lines.length - 1 ? 'Stay with this afternoon' : 'Next story line →';
  $('choice-actions').hidden = !state.proposal;
  $('lift-actions').hidden = !accepted;
  $('spool-handle').hidden = !accepted || state.paused;
  $('kite').setAttribute('opacity', visible ? '1' : '0');
  $('kite').classList.toggle('proposed', !accepted);
  $('spool-art').setAttribute('opacity', accepted ? '1' : '0');
  $('kite-string').style.opacity = accepted ? '.85' : '0';
  $('ribbon').style.opacity = state.ribbon === 'cream' ? '.95' : '.18';
  $('paper-light').setAttribute('stop-color', state.color === 'red' ? '#cb4634' : '#f0e8c9');
  $('paper-dark').setAttribute('stop-color', state.color === 'red' ? '#9d3029' : '#cec29e');
  $('breeze').textContent = state.flying ? 'Let the kite settle' : 'Catch the breeze';
  $('pause').textContent = state.paused ? 'Continue' : 'Pause';
  $('paused-overlay').hidden = !state.paused;
  for (const id of ['accept', 'leave', 'breeze', 'read', 'reset', 'uncertain']) $(id).disabled = state.paused;
  $('read').disabled ||= !('speechSynthesis' in window);

  let title, description;
  if (state.scenario === 'uncertain') {
    title = 'An open question can stay open.';
    description = "An uncertain object isn't a request to create one. The meadow stays as it is, and the story can continue without a kite.";
  } else if (state.proposal === 'identity') {
    title = 'A kite, with its color still open.';
    description = 'The words name a kite. This neutral sketch is an illustration proposal; no color has been chosen.';
  } else if (state.proposal === 'details') {
    title = 'Red paper. A cream ribbon.';
    description = 'These details came from this sample line. Choose them for our illustration, or leave them open. The visible kite keeps its previous look until you choose.';
  } else if (accepted) {
    title = state.color === 'red' ? 'A small piece of the afternoon.' : 'Room for a detail to arrive.';
    description = state.color === 'red' ? 'The red and cream are chosen for this depiction. Lift the spool and let the kite meet the breeze.' : 'The kite is chosen for the illustration. Its color is still unknown; we can keep telling the story.';
  } else {
    title = state.beat === 0 ? 'We can begin with the place.' : 'We can leave that open.';
    description = 'There is no detail to get right and no score to fill. Follow the next story line when you are ready.';
  }
  $('choice-title').textContent = title;
  $('choice-description').textContent = description;
  const last = state.choices.at(-1);
  $('choice-record').textContent = last ? `${last.action === 'use-this-look' ? 'Illustration chosen' : 'Detail left open'} · source ${last.sourceId}. This does not verify a historical memory.` : 'No illustration choices yet.';
  $('world-state').textContent = state.paused ? 'Paused, whenever you need' : state.scenario === 'uncertain' ? 'No object inferred from uncertainty' : accepted ? state.color === 'red' ? 'Red and cream · chosen depiction' : 'Kite chosen · color open' : state.proposal ? 'An illustration proposal' : 'A place to begin';
  draw();
}

function localPoint(clientX, clientY) {
  const rect = overlay.getBoundingClientRect();
  const scale = Math.max(rect.width / 1440, rect.height / 900);
  return { x: (clientX - rect.left - (rect.width - 1440 * scale) / 2) / scale,
    y: (clientY - rect.top - (rect.height - 900 * scale) / 2) / scale };
}

function draw() {
  const t = reduced.matches ? 0 : state.simulationSeconds;
  const lift = state.held ? Math.max(0, Math.min(1, (dock.y - spool.y) / 150)) : state.flying ? 1 : 0;
  const x = 590 + Math.sin(t * .52) * 11;
  const y = 311 - (reduced.matches ? 12 : 60) * lift + Math.sin(t * .73) * 6;
  const angle = reduced.matches ? -8 : -8 + Math.sin(t * .67) * 4;
  $('kite').setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(2)}) scale(.78)`);
  const sway = Math.sin(t * 1.7) * (reduced.matches ? 0 : 11);
  $('ribbon').setAttribute('d', `M0 109 C${-9 + sway} 137 ${28 + sway} 145 12 170 S${-24 - sway} 204 ${2 + sway} 235 S${24 + sway} 263 ${8 + sway} 290`);
  $('spool-art').setAttribute('transform', `translate(${spool.x.toFixed(2)} ${spool.y.toFixed(2)}) rotate(-8)`);
  $('kite-string').setAttribute('d', `M${spool.x + 2} ${spool.y - 14} Q${(spool.x + x) / 2 - 40} ${(spool.y + y) / 2 + 25} ${x + 3} ${y + 24}`);
  const rect = overlay.getBoundingClientRect();
  const scale = Math.max(rect.width / 1440, rect.height / 900);
  $('spool-handle').style.left = `${(rect.width - 1440 * scale) / 2 + spool.x * scale}px`;
  $('spool-handle').style.top = `${(rect.height - 900 * scale) / 2 + spool.y * scale}px`;
}

$('next').addEventListener('click', () => loadBeat(Math.min(lines.length - 1, state.beat + 1)));
$('accept').addEventListener('click', accept);
$('leave').addEventListener('click', leaveOpen);
$('breeze').addEventListener('click', breeze);
$('pause').addEventListener('click', () => setPaused(!state.paused));
$('resume').addEventListener('click', () => setPaused(false));
$('reset').addEventListener('click', () => {
  if (state.paused) return;
  stopSpeech(); releasePointer(); state = fresh(); spool = { ...dock }; render();
});
$('uncertain').addEventListener('click', () => {
  if (state.paused) return;
  stopSpeech(); releasePointer(); state = { ...fresh(), scenario: 'uncertain' }; spool = { ...dock }; render();
});
$('read').addEventListener('click', () => {
  if (state.paused || !('speechSynthesis' in window)) return;
  stopSpeech();
  const epoch = speechEpoch;
  const utterance = new SpeechSynthesisUtterance(currentLine().text);
  utterance.rate = .85;
  state.sampleSpeech = 'requested';
  $('audio-status').textContent = 'Browser sample voice requested · not an original recording.';
  utterance.onstart = () => { if (epoch === speechEpoch && !state.paused) state.sampleSpeech = 'speaking'; };
  const ended = () => {
    if (epoch !== speechEpoch) return;
    state.sampleSpeech = 'idle';
    $('audio-status').textContent = 'Browser sample playback ended · not an original recording.';
  };
  utterance.onend = ended; utterance.onerror = ended;
  window.speechSynthesis.speak(utterance);
});
$('spool-handle').addEventListener('pointerdown', (event) => {
  if (state.paused || state.identity !== 'accepted' || event.button !== 0) return;
  pointerId = event.pointerId; state.held = true;
  $('spool-handle').setPointerCapture(pointerId); event.preventDefault();
});
$('spool-handle').addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointerId || state.paused) return;
  const point = localPoint(event.clientX, event.clientY);
  spool.x = Math.max(dock.x - 75, Math.min(dock.x + 75, point.x));
  spool.y = Math.max(dock.y - 150, Math.min(dock.y + 10, point.y));
  draw();
});
function finishDrag(event) {
  if (event.pointerId !== pointerId) return;
  if (dock.y - spool.y > 35) state.flying = true;
  releasePointer(); render();
}
$('spool-handle').addEventListener('pointerup', finishDrag);
$('spool-handle').addEventListener('pointercancel', () => { releasePointer(); });
$('spool-handle').addEventListener('click', (event) => { if (event.detail === 0) breeze(); });
window.addEventListener('resize', draw);
window.addEventListener('pagehide', stopSpeech);
window.addEventListener('blur', () => { releasePointer(); });
reduced.addEventListener('change', draw);
let previous = performance.now();
function frame(now) {
  const dt = Math.min((now - previous) / 1000, .05); previous = now;
  if (!state.paused) {
    state.simulationSeconds += dt;
    if (!state.held) {
      const f = reduced.matches ? 1 : 1 - Math.exp(-dt * 8);
      spool.x += (dock.x - spool.x) * f; spool.y += (dock.y - spool.y) * f;
    }
    draw();
  }
  requestAnimationFrame(frame);
}
render(); requestAnimationFrame(frame);
