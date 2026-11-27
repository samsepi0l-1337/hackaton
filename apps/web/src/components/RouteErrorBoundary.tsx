import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorState } from './States';

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: unknown) {
    if (!(error instanceof Error) || !/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message)) return;
    try {
      const key = 'gil:preload-reloaded';
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      window.location.reload();
    } catch {
      // Keep the error state visible if storage or reload is unavailable.
    }
  }

  render() {
    if (this.state.failed) {
      return <div className="container"><ErrorState onRetry={() => window.location.reload()} /></div>;
    }
    return this.props.children;
  }
}
