// Under each of your memories: who can see it. Private by default; Public puts it in World memories, where you made it.
import type { AlbumMemory } from '../album/types';
import { useGate } from '../state/store';
import { GlobeIcon, LockIcon } from '../ui/Icons';
import { useVisibility, visibilityKey, type Visibility } from './state';

const OPTIONS: { value: Visibility; label: string; Icon: typeof LockIcon }[] = [
  { value: 'private', label: 'Private', Icon: LockIcon },
  { value: 'public', label: 'Public', Icon: GlobeIcon },
];

export function VisibilityChoice({ memory }: { memory: AlbumMemory }) {
  const code = useGate((s) => s.session?.code ?? null);
  const key = visibilityKey(memory, code);
  const value: Visibility = useVisibility((s) => (s.publicKeys[key] ? 'public' : 'private'));
  const set = useVisibility((s) => s.set);
  return (
    <fieldset className="visibility" data-testid="visibility" data-value={value}>
      <legend className="visually-hidden">Who can see “{memory.title}”</legend>
      <div className="visibility-seg glass">
        {OPTIONS.map(({ value: v, label, Icon }) => (
          <label key={v} className="visibility-opt" data-on={value === v}>
            <input type="radio" className="visually-hidden" name={`visibility-${key}`} value={v} checked={value === v} onChange={() => set(key, v)} data-testid={`visibility-${v}`} />
            <Icon /> {label}
          </label>
        ))}
      </div>
      <span className="visibility-note" aria-live="polite">{value === 'public' ? 'Shown in World memories' : 'Only you can see this'}</span>
    </fieldset>
  );
}
