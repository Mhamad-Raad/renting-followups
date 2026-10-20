import { Component, type ErrorInfo, type ReactNode } from 'react';
import { stackFrames } from '@shared/errors';
import { callIpc } from './ipc';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** What to show instead of the broken part; `reset` tries to show the children again. */
  fallback: (reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches a crash in part of the screen and shows a friendly message instead of
 * a blank window. Technical details go to the local log only.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentFrames = (info.componentStack ?? '').trim().split('\n').slice(0, 5).join(' |');
    void callIpc('log:rendererError', {
      name: error.name.slice(0, 100),
      stack: `${stackFrames(error)} || ${componentFrames}`.slice(0, 4000),
    });
  }

  private readonly reset = (): void => {
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
