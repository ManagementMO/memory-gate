import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from 'convex/react';
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from 'convex/server';
import { problemOf, type Problem } from './errors';

/** useQuery that hands errors back as values (a deleted room or a revoked member must not crash the screen). */
export function useLiveQuery<Q extends FunctionReference<'query'>>(
  query: Q,
  args: FunctionArgs<Q> | 'skip',
): { data: FunctionReturnType<Q> | undefined; problem: Problem | null } {
  const skip = args === 'skip';
  const name = getFunctionName(query);
  const key = skip ? 'skip' : JSON.stringify(args);
  const queries = useMemo(
    (): Parameters<typeof useQueries>[0] => (skip ? {} : { q: { query, args: args as Record<string, never> } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, key],
  );
  const result: unknown = useQueries(queries)['q'];
  if (result instanceof Error) return { data: undefined, problem: problemOf(result) };
  return { data: result as FunctionReturnType<Q> | undefined, problem: null };
}

/** A clock for "headset seen in the last 20 s" and elapsed timers. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Run one user command: tracks busy state and turns failures into a plain message (returned and reported). */
export function useRunner(report: (p: Problem) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; problem: Problem }> => {
    setBusy(label);
    try {
      const value = await fn();
      return { ok: true, value };
    } catch (e) {
      const problem = problemOf(e);
      report(problem);
      return { ok: false, problem };
    } finally {
      setBusy((b) => (b === label ? null : b));
    }
  }, [report]);
  return { busy, run };
}

/** Long-press (≈0.6 s) for the hidden admin screen; a visible "⋯" button does the same for everyone else. */
export function useLongPress(onLongPress: () => void, ms = 600) {
  const timer = useRef<number | null>(null);
  const clear = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clear, []);
  return {
    onPointerDown: () => { clear(); timer.current = window.setTimeout(() => { timer.current = null; onLongPress(); }, ms); },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
}

/** Clipboard writes need a secure context; plain http on the Wi-Fi falls back to a hidden textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function useHashRoute<R extends string>(routes: readonly R[], fallback: R): [R, (r: R) => void] {
  const read = useCallback((): R => {
    const h = window.location.hash.replace(/^#\/?/, '');
    return (routes as readonly string[]).includes(h) ? (h as R) : fallback;
  }, [routes, fallback]);
  const [route, setRoute] = useState<R>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [read]);
  const go = useCallback((r: R) => {
    if (window.location.hash !== `#/${r}`) window.location.hash = `/${r}`;
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}
