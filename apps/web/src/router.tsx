import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'

import { AppShell, NotFoundPage, RouteError } from './components/app-shell'
import { BooksCollectionPage } from './features/books/books-collection-page'
import { parseBooksRouteSearch } from './features/books/books-route-search'
import { MoviesCollectionPage } from './features/movies/movies-collection-page'
import { parseMoviesRouteSearch } from './features/movies/movies-route-search'
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

const moviesArchiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/movies/archive',
  validateSearch: parseMoviesRouteSearch,
  component: () => <MoviesCollectionPage collection="archive" />,
})

const moviesQueueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/movies/queue',
  validateSearch: parseMoviesRouteSearch,
  component: () => <MoviesCollectionPage collection="queue" />,
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
  moviesArchiveRoute,
  moviesQueueRoute,
  connectionsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
