import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'

import { AppShell, NotFoundPage, RouteError } from './components/app-shell'
import { BooksCollectionPage } from './features/books/books-collection-page'
import { parseBooksRouteSearch } from './features/books/books-route-search'
import { ConnectionsPage } from './pages/connections-page'

const rootRoute = createRootRoute({
  component: AppShell,
  errorComponent: RouteError,
  notFoundComponent: NotFoundPage,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/library/books/archive' })
  },
})

const booksArchiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/books/archive',
  validateSearch: parseBooksRouteSearch,
  component: () => <BooksCollectionPage collection="archive" />,
})

const booksQueueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/books/queue',
  validateSearch: parseBooksRouteSearch,
  component: () => <BooksCollectionPage collection="queue" />,
})

const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/connections',
  component: ConnectionsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  booksArchiveRoute,
  booksQueueRoute,
  connectionsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
