import { Component, type ReactNode } from "react";

/**
 * Keeps one broken view from blanking the whole app: shows the error in place, with the
 * sidebar still usable, and resets when the route changes (via `resetKey`).
 */
export class ErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page-narrow" style={{ padding: 20 }}>
        <div className="callout callout-danger" style={{ flexDirection: "column" }}>
          <strong>This page hit an error.</strong>
          <span className="mono xsmall">{this.state.error.message}</span>
        </div>
        <button style={{ marginTop: 10 }} onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
