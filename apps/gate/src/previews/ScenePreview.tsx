// ?preview=scene — draw a memory straight into the white space, no conversation needed.
//   &text=...        plan offline from words (free)
//   &live=1          plan with Claude through the backend (spends tokens; used by the accuracy evaluation)
//   &plan=/eval/x.json  draw a stored plan
//   &sf=sf:gg-trail  draw a shared San Francisco memory (src/sf/memories.ts), or sf:golden-gate for the crowd
//   &companion=none  hide the companion
import { ConvexProvider } from 'convex/react';
import { useEffect, useState } from 'react';
import { api } from '../../../../convex/_generated/api';
import { planOffline, validatePlan, type ScenePlan } from '../../../../packages/shared/src/scene';
import { convex, startSession } from '../backend/client';
import { useMemory } from '../flow/memory';
import { SceneCanvas } from '../scene/SceneCanvas';
import { useGate } from '../state/store';
import { sfMemory } from '../sf/memories';

(window as unknown as { __scenePreview: boolean }).__scenePreview = true;
const params = new URLSearchParams(location.search);
if (params.get('companion') === 'none') (window as unknown as { __hideCompanion: boolean }).__hideCompanion = true;
const DEFAULT_TEXT = 'My grandmother’s kitchen in the morning. Yellow curtains on the window, a round wooden table with two chairs, and her radio on the counter.';

async function loadPlan(): Promise<{ plan: ScenePlan; source: string }> {
  // &compose=1: a live session, so things outside the library are composed by Claude (cached per label).
  if (params.get('compose') === '1' && !useGate.getState().session) {
    const s = await startSession({ name: 'Preview', invite: null });
    if (s) useGate.getState().set({ session: s });
  }
  const sf = params.get('sf');
  if (sf) { const m = sfMemory(sf); if (m) { useMemory.setState({ shared: true }); return { plan: validatePlan(m.plan), source: 'sf' }; } }
  const planUrl = params.get('plan');
  if (planUrl) return { plan: validatePlan(await (await fetch(planUrl)).json()), source: 'stored' };
  const text = params.get('text') ?? DEFAULT_TEXT;
  if (params.get('live') === '1') {
    const s = await startSession({ name: 'Preview', invite: null });
    if (s) {
      useGate.getState().set({ session: s });
      const r = await convex.action(api.sketch.plan, { code: s.code, token: s.token, words: [text] });
      if (r?.plan) return { plan: validatePlan(r.plan), source: r.source };
    }
  }
  return { plan: planOffline(text), source: 'offline' };
}

export default function ScenePreview() {
  const [info, setInfo] = useState<{ title: string; source: string; objects: string } | null>(null);
  useEffect(() => {
    useGate.getState().set({ stage: 'memory', companion: params.get('companion') === 'light' ? 'light' : 'figure' });
    void loadPlan().then(({ plan, source }) => {
      useMemory.setState({ plan, version: 1 });
      useGate.getState().set({ memoryTitle: plan.title });
      setInfo({ title: plan.title, source, objects: plan.objects.map((o) => `${o.label}${o.kind === 'custom' ? ' (composed)' : ''}`).join(', ') });
      (window as unknown as { __plan: ScenePlan }).__plan = plan;
    });
  }, []);
  return (
    <ConvexProvider client={convex}>
      <div className="app">
        <SceneCanvas />
        <div className="overlay on-paper" style={{ pointerEvents: 'none' }}>
          {info && params.get('caption') !== '0' && (
            <div style={{ position: 'absolute', left: 28, top: 22, maxWidth: 560 }}>
              <h1 className="memory-title">{info.title}</h1>
              <p style={{ margin: '6px 0 0', font: '400 13px/1.45 var(--sans)', color: 'var(--paper-ink-soft)' }} data-testid="scene-info">
                Planned {info.source === 'claude' ? 'by Claude' : info.source === 'offline' ? 'offline (keywords)' : 'from a stored plan'}: {info.objects}
              </p>
            </div>
          )}
        </div>
      </div>
    </ConvexProvider>
  );
}
