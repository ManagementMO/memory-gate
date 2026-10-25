import { bringIn, placePlan, PLACES } from '../../../../packages/shared/src/places';
import { flow } from '../flow/controller';
import './welcome.css';

/** A labeled example through the existing prepared-place flow; no scraping or world generation on the home screen. */
export function exploreMeadow(): Promise<void> {
  const place = PLACES['red-kite'];
  const empty = placePlan(place, 'The meadow · fictional sample');
  const plan = bringIn(place, empty, 'A white kite with a spool on a side table.') ?? empty;
  return flow.visitPlace(place.key, plan);
}

export function MemoryAddOnsWelcome({ onExplore, disabled, opening }: {
  onExplore: () => void;
  disabled: boolean;
  opening: boolean;
}) {
  return (
    <div className="memory-discovery-welcome" data-testid="home-discovery">
      <button type="button" className="pill glass memory-discovery-link" onClick={onExplore}
        disabled={disabled} aria-describedby="home-discovery-note" data-testid="explore-meadow">
        <span aria-hidden="true">◇</span>{opening ? 'Opening the meadow…' : 'Explore the meadow'}
      </button>
      <p id="home-discovery-note">Kite, flowers &amp; tree
        <small>Fictional sample · select a marker for a short public reference.</small>
      </p>
    </div>
  );
}
