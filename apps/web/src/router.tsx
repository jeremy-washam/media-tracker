import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { AppShell, NotFoundPage, RouteError } from './components/app-shell'
import { ConnectionsPage } from './pages/connections-page'
import { HistoryPage } from './pages/history-page'

const rootRoute = createRootRoute({
  component: AppShell,
  errorComponent: RouteError,
  notFoundComponent: NotFoundPage,
})

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HistoryPage,
})

const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/connections',
  component: ConnectionsPage,
})

const routeTree = rootRoute.addChildren([historyRoute, connectionsRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
