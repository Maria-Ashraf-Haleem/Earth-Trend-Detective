import { Component, Suspense, type ReactNode } from 'react'

/** Keep a failed or still-downloading visualization local to its own panel. */
export class AsyncPanel extends Component<{
  children: ReactNode
  label: string
  height?: number | string
}, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    const { children, label, height = '100%' } = this.props
    const panel = (failed: boolean) => <div style={{ minHeight: height }}
      className="flex h-full items-center justify-center bg-[var(--surface-2)] p-5 text-center text-[13px] text-[var(--muted)]"
      role={failed ? 'alert' : 'status'} aria-live="polite">
      {failed ? <div><p>{label} could not load. Your data and controls remain available.</p>
        <button className="mt-3 underline" onClick={() => window.location.reload()}>Reload page</button></div>
        : `Loading ${label.toLowerCase()}...`}
    </div>
    return this.state.failed ? panel(true) : <Suspense fallback={panel(false)}>{children}</Suspense>
  }
}
