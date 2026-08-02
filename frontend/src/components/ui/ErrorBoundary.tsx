import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence for render-time crashes.
 *
 * Without it React unmounts the whole tree and leaves a blank white page, which
 * gives an operator nothing to report and no way forward but guessing. This at
 * least names the failure and offers a reload.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[tocs] render crash', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-5">
        <div className="w-full max-w-md rounded-xl border border-line bg-canvas-raised p-6 text-center shadow-soft">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger-strong">
            <AlertTriangle size={24} />
          </div>
          <h1 className="mt-4 text-lg font-bold text-ink">Terjadi kesalahan pada tampilan</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Halaman ini gagal dimuat. Muat ulang untuk mencoba lagi — laporkan pesan di bawah bila
            terus berulang.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-canvas px-3 py-2 text-left font-mono text-[11px] text-danger-strong">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary btn-md mt-4 w-full"
          >
            <RotateCcw size={16} />
            Muat ulang halaman
          </button>
        </div>
      </div>
    );
  }
}
