import { useEffect, useState } from 'react';
import { headsetLink } from '../backend';

/** A screen is a first-class way to spend time together; a headset is optional. No camera or microphone access. */
export function MemoryStage({ code, title, illustrative, sharing, paused, onConsent }: {
  code: string; title: string; illustrative: boolean; sharing: boolean; paused: boolean; onConsent: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!sharing) setOpen(false); }, [sharing]);
  const url = new URL(headsetLink(code).url);
  url.searchParams.set('view', 'spectator'); url.searchParams.set('drift', '0'); url.searchParams.set('embed', '1');
  return <section className={`memory-stage ${open ? 'is-open' : ''}`} aria-label="Your shared place" data-testid="memory-stage">
    <div className={`stage-window ${illustrative ? 'is-courtyard' : ''}`}>
      {open && sharing ? <iframe src={url.toString()} title={`Shared place: ${title}`} data-testid="memory-stage-frame"
        sandbox="allow-scripts allow-same-origin" allow="" referrerPolicy="no-referrer" /> : <div className="stage-invitation">
        <span className="stage-kicker">A place for your story</span>
        <h2>{illustrative ? 'Stay a little.\nTell it your way.' : 'Your words,\na place to share.'}</h2>
        <button className="btn stage-open" type="button" data-testid="stage-open" disabled={paused}
          onClick={() => sharing ? setOpen(true) : onConsent()}>
          <span aria-hidden="true">↗</span> {sharing ? 'Open the shared place' : 'Choose sharing permissions'}
        </button>
      </div>}
      {paused && <div className="stage-rest" role="status"><span aria-hidden="true">Ⅱ</span><h2>We can rest here.</h2><p>Take as long as you like.</p></div>}
    </div>
    <div className="stage-caption">
      <p><span className="stage-status-dot" aria-hidden="true" />{open && sharing ? 'Shared view · follows your conversation' : 'Screen or Quest · choose what feels comfortable'}</p>
      {open && <button className="btn btn-quiet" onClick={() => setOpen(false)}>Close view</button>}
    </div>
    <p className="stage-provenance">{illustrative ? 'Original illustrative garden. Scenery is imagined; story objects come from your words.' : 'Generated scenery is an interpretation of a source photo, not a recovered memory.'}</p>
  </section>;
}
