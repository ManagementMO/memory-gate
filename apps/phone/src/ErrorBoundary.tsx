import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last-resort screen: something unexpected broke while drawing. Plain words and a next step, never a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.warn('phone app error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen narrow" data-testid="app-error">
        <p className="eyebrow">Memory Gate</p>
        <div className="notice notice-error" role="alert">
          <p className="notice-title">Something went wrong on this screen.</p>
          <p>Your room is safe. Reload to pick up where you were.</p>
        </div>
        <button type="button" className="btn btn-primary btn-wide" onClick={() => window.location.reload()}>Reload</button>
      </main>
    );
  }
}
