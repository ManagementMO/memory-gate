// The quiet frame: the wordmark (or, on the far side, the memory's name), a listening indicator that tells you
// you're heard, and the few controls a person might reach for: sound, rest, leave.
import { useEffect, useRef } from 'react';
import { flow } from '../flow/controller';
import { useGate } from '../state/store';
import { useSocial } from '../social/store';
import { LeaveIcon, MapIcon, MuteIcon, PhotosIcon, PlayIcon, RestIcon, SoundIcon } from './Icons';
import { openObjectWorkshop } from '../memory-objects/workshop';
import { SettingsButton } from './CompanionSettings';

/** The memory map: where your memories live, and where others have shared theirs (it opens over the palace). */
function MapButton() {
  return (
    <button type="button" className="moments-btn map-btn glass" aria-label="Memory map" title="Memory map" onClick={() => flow.openAlbum()} data-testid="open-map">
      <MapIcon />
    </button>
  );
}

function ListeningChip() {
  const voice = useGate((s) => s.voice);
  const joined = useGate((s) => !!s.invite);
  const together = useSocial((s) => s.status === 'live');
  const mood = useGate((s) => s.mood);
  const resting = useGate((s) => s.resting);
  const stage = useGate((s) => s.stage);
  const dot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = useGate.getState();
      if (dot.current) dot.current.style.transform = `scale(${1 + (s.mood === 'listening' ? s.level * 0.9 : 0)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (stage === 'portal' || stage === 'album') return null;
  // A joined device listens itself while the room's companion is here (one conversation); otherwise the main one does.
  const shared = voice === 'shared' || (joined && !together && voice !== 'blocked' && voice !== 'starting');
  const live = voice === 'cartesia' || voice === 'browser' || shared;
  const text = resting ? 'Resting' : shared ? 'Listening on the main device' : voice === 'blocked' ? 'Microphone is off' : voice === 'unsupported' ? 'Voice isn’t available here' : voice === 'starting' ? 'Getting ready' : mood === 'speaking' ? 'Speaking' : mood === 'thinking' ? 'Thinking' : 'Listening';
  const tone = resting ? 'rest' : live ? 'on' : 'off';
  return (
    <div className="status glass dot-only" role="status" aria-live="polite" data-tone={tone} data-testid="listening" title={text}>
      <span className="dot" ref={dot} aria-hidden="true" />
      <span className="visually-hidden">{text}</span>
    </div>
  );
}

export function TopBar() {
  const stage = useGate((s) => s.stage);
  const musicOn = useGate((s) => s.musicOn);
  const resting = useGate((s) => s.resting);
  const title = useGate((s) => s.memoryTitle);
  const guest = useGate((s) => !!s.invite);
  const day = stage === 'forming' || stage === 'memory' || stage === 'leaving';
  const inConversation = stage !== 'portal' && stage !== 'album';
  return (
    <header className="topbar">
      {day && title ? <h1 className="memory-title" data-testid="memory-title">{title}</h1> : <div className="wordmark">Memora</div>}
      {inConversation && <ListeningChip />}
      <div className="right">
        {(stage === 'memory' || stage === 'forming') && <button type="button" className="icon-btn glass" aria-label="Places and objects" title="Places and objects" data-testid="places-objects" onClick={openObjectWorkshop}><PhotosIcon /></button>}
        {stage === 'portal' && <SettingsButton />}
        {stage === 'portal' && !guest && <MapButton />}
        {stage !== 'portal' && (
          <button type="button" className="icon-btn glass" aria-label={musicOn ? 'Turn music off' : 'Turn music on'} aria-pressed={!musicOn} onClick={() => flow.setMusic(!musicOn)} data-testid="music">
            {musicOn ? <SoundIcon /> : <MuteIcon />}
          </button>
        )}
        {inConversation && (
          <button type="button" className="icon-btn glass" aria-label={resting ? 'Continue' : 'Rest for a moment'} onClick={() => (resting ? flow.resume() : flow.rest())} data-testid="rest">
            {resting ? <PlayIcon /> : <RestIcon />}
          </button>
        )}
        {(stage === 'memory' || stage === 'forming') && (
          <button type="button" className="pill glass" onClick={() => flow.leave()} data-testid="leave">
            <LeaveIcon /> Leave
          </button>
        )}
      </div>
    </header>
  );
}
