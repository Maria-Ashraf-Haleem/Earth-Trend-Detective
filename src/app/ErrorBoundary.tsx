import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  message: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="grid min-h-screen place-items-center bg-[var(--bg)] px-5">
          <div className="w-full max-w-xl border border-[var(--line-strong)] bg-[var(--surface)] p-7">
            <p className="kicker text-[var(--warn)]">Signal interrupted</p>
            <h1 className="display mt-3 text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">Something went wrong.</h1>
            <p className="mt-3 border-l-2 border-[var(--danger)] pl-3 font-mono text-[11px] leading-relaxed text-[var(--muted)]">
              {this.state.message}
            </p>
            <button
              type="button"
              className="mt-6 inline-flex h-9 items-center border border-[var(--line-strong)] px-3 font-mono text-[9px] tracking-[0.12em] uppercase text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              onClick={() => this.setState({ message: null })}
            >
              Retry the plate
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
