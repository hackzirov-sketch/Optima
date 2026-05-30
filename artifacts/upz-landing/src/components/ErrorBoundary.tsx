import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="grid min-h-screen place-items-center bg-[#F7FAFC] p-8">
            <div className="max-w-md text-center">
              <h1 className="text-2xl font-bold text-[#111827]">Something went wrong</h1>
              <p className="mt-2 text-sm text-[#6B7280]">
                {this.state.error?.message ?? "An unexpected error occurred"}
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 rounded-2xl bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Reload page
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
