// PLACEHOLDER (replaced by the full liquid-glass album): lists the moments taken on this device.
import { useMoments } from '../flow/moments';

export default function AlbumView({ onBeginAnother }: { onBeginAnother: () => void }) {
  const memories = useMoments((s) => s.memories);
  return (
    <section className="album-placeholder" data-testid="album">
      <h1>Your moments</h1>
      {memories.map((m) => (
        <div key={m.id}><h2>{m.title}</h2>{m.moments.map((x) => <p key={x.id}>{x.caption}</p>)}</div>
      ))}
      <button type="button" className="pill glass" onClick={onBeginAnother}>Visit another memory</button>
    </section>
  );
}
