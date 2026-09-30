import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";

/**
 * Props for ErrorBoundary component
 */
interface Props {
  /** Child nodes wrapped by this boundary */
  children: ReactNode;
  /** Custom title displayed when an error occurs */
  fallbackTitle?: string;
  /** Custom explanatory message for clinical or administrative users */
  fallbackMessage?: string;
  /** Name of the UI module / subsystem protected by this boundary */
  sectionName?: string;
  /** Optional callback invoked when the user clicks 'Try Again' */
  onReset?: () => void;
  /** If true, renders a compact card boundary instead of a full-screen fallback */
  isolate?: boolean;
}

/**
 * State for ErrorBoundary component
 */
interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * ErrorBoundary
 *
 * A production-grade React 18 class error boundary implementing getDerivedStateFromError
 * and componentDidCatch. Provides hierarchical fault-isolation across DigniSafe:
 *
 * 1. Root Application Boundary: Prevents full white-screen unmounts if fatal runtime bugs occur.
 * 2. Feature Section Boundaries: Isolates complex subsystems (Recharts circadian charts,
 *    live WebSocket alert triage cards, IoT gateway telemetry grids) so a crash in one
 *    component does not disrupt real-time safety monitoring of residents.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  /**
   * Catches errors in descendant components and updates state to trigger fallback UI.
   */
  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      showDetails: false,
    };
  }

  /**
   * Captures runtime error telemetry and component call stack for auditing.
   */
  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Log structured error telemetry for facility diagnostics
    console.error(
      `[DigniSafe UI ErrorBoundary] Caught error in ${this.props.sectionName || "Unknown Module"}:`,
      {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Resets error state to attempt re-rendering the children.
   */
  public handleReset = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  /**
   * Toggles display of raw error stack trace (useful during review and diagnostics).
   */
  public toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render(): ReactNode {
    const { hasError, error, errorInfo, showDetails } = this.state;
    const {
      children,
      fallbackTitle = "Component Encountered an Unexpected Error",
      fallbackMessage = "The safety monitoring console isolated this error to ensure uninterrupted resident oversight.",
      sectionName = "Subsystem",
      isolate = false,
    } = this.props;

    if (!hasError) {
      return children;
    }

    // Isolated inline boundary (for dashboard widgets, charts, and tables)
    if (isolate) {
      return (
        <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-5 my-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-lg shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-rose-200">
                  {sectionName}: {fallbackTitle}
                </h4>
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/80 hover:bg-rose-500 text-white rounded-lg text-xs font-medium transition shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Section
                </button>
              </div>
              <p className="text-xs text-rose-300/90 mt-1 leading-relaxed">
                {fallbackMessage}
              </p>

              {error && (
                <div className="mt-3">
                  <button
                    onClick={this.toggleDetails}
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400 hover:text-rose-300 underline underline-offset-2"
                  >
                    {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showDetails ? "Hide Diagnostic Trace" : "View Diagnostic Trace"}
                  </button>

                  {showDetails && (
                    <div className="mt-2 p-3 bg-slate-950/90 border border-rose-500/30 rounded-lg text-[11px] font-mono text-rose-200 overflow-x-auto max-h-48">
                      <p className="font-bold text-rose-400 mb-1">{error.name}: {error.message}</p>
                      {error.stack && <pre className="whitespace-pre-wrap text-slate-400 text-[10px]">{error.stack}</pre>}
                      {errorInfo && (
                        <pre className="mt-2 text-slate-500 text-[10px] border-t border-slate-800 pt-1">
                          {errorInfo.componentStack}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Root full-view error boundary fallback
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-slate-900/90 border border-rose-500/40 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs uppercase font-mono tracking-wider text-rose-400 font-semibold">
                DigniSafe Fault Containment
              </span>
              <h2 className="text-xl font-bold text-white mt-0.5">{fallbackTitle}</h2>
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            {fallbackMessage} Real-time ambient backend ingestion and critical sensor safety monitoring
            remain fully operational. You can safely reload the interface view.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-emerald-900/20"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Interface
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-medium transition"
            >
              Hard Browser Refresh
            </button>
          </div>

          {error && (
            <div className="mt-6 pt-6 border-t border-slate-800">
              <button
                onClick={this.toggleDetails}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-slate-200"
              >
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showDetails ? "Hide Technical Details" : "Show Technical Details (For Reviewers)"}
              </button>

              {showDetails && (
                <div className="mt-3 p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-rose-300 overflow-x-auto max-h-60">
                  <p className="font-semibold text-rose-400 mb-1">{error.name}: {error.message}</p>
                  {error.stack && <pre className="whitespace-pre-wrap text-slate-400 text-[11px]">{error.stack}</pre>}
                  {errorInfo && (
                    <pre className="mt-2 text-slate-500 text-[10px] border-t border-slate-800 pt-2">
                      {errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
