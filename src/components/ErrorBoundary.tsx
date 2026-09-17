import React, { Component, ErrorInfo, ReactNode } from 'react';
import { crashService } from '../lib/crashlytics/crashService';
import { ShieldAlert, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
    crashService.recordNonFatalError('RENDER_BOUNDARY', error, {
      componentStack: errorInfo.componentStack?.slice(0, 500),
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-5 text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-2">Something went wrong</h1>
          <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
            RoomMate encountered an unexpected error. The diagnostics have been recorded to help us resolve it quickly.
          </p>
          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 active:scale-95 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Restart RoomMate
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
