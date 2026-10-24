import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Problem } from './errors';

type Toast = { id: number; text: string; tone: 'info' | 'error' | 'ok' };
type ToastApi = { say: (text: string, tone?: Toast['tone']) => void; report: (p: Problem) => void };

const ToastCtx = createContext<ToastApi>({ say: () => {}, report: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const say = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = next.current++;
    setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const report = useCallback((p: Problem) => say(p.message, 'error'), [say]);
  const api = useMemo(() => ({ say, report }), [say, report]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite" data-testid="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} data-testid={`toast-${t.tone}`}>
            <span>{t.text}</span>
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Notice({ tone = 'info', title, children, testId }: { tone?: 'info' | 'warn' | 'error' | 'ok'; title?: string; children?: ReactNode; testId?: string }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined} data-testid={testId}>
      {title && <p className="notice-title">{title}</p>}
      {children}
    </div>
  );
}

export function Chip({ kind, children, testId }: { kind: string; children: ReactNode; testId?: string }) {
  return <span className={`chip chip-${kind}`} data-testid={testId}>{children}</span>;
}

export function Spinner({ label }: { label: string }) {
  return <span className="spinner" role="img" aria-label={label} />;
}

export function Loading({ text = 'Opening the room…' }: { text?: string }) {
  return (
    <div className="loading" data-testid="loading">
      <Spinner label="Loading" />
      <p>{text}</p>
    </div>
  );
}
