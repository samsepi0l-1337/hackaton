import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorState } from './States';

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) {
      return <div className="container"><ErrorState onRetry={() => window.location.reload()} /></div>;
    }
    return this.props.children;
  }
}
