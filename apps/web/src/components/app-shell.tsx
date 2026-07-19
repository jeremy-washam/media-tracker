import { Link, Outlet } from '@tanstack/react-router'

import { HealthIndicator } from './health-indicator'

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Media Tracker home">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span>
            Media Tracker
            <small>Private archive</small>
          </span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}>
            History
          </Link>
          <Link to="/connections" activeProps={{ className: 'active' }}>
            Connections
          </Link>
        </nav>

        <HealthIndicator />
      </header>

      <main className="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <span>Private by design</span>
        <span>Local scaffold · v0.0.0</span>
      </footer>
    </div>
  )
}

export function RouteError({ error }: { error: Error }) {
  return (
    <section className="page-stack">
      <div className="notice notice-error" role="alert">
        <h1>Something went wrong</h1>
        <p>{error.message}</p>
      </div>
    </section>
  )
}

export function NotFoundPage() {
  return (
    <section className="page-stack">
      <div className="empty-panel">
        <div>
          <h1>Page not found</h1>
          <p>This page does not exist in the private archive.</p>
          <Link className="text-link" to="/">
            Return to history
          </Link>
        </div>
      </div>
    </section>
  )
}
