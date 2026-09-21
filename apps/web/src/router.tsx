import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'

import { AppShell, NotFoundPage, RouteError } from './components/app-shell'
import { BooksCollectionPage } from './features/books/books-collection-page'
import { ArticlesCollectionPage } from './features/articles/articles-collection-page'
import { parseArticlesRouteSearch } from './features/articles/articles-route-search'
import { parseBooksRouteSearch } from './features/books/books-route-search'
import { MoviesCollectionPage } from './features/movies/movies-collection-page'
import { parseMoviesRouteSearch } from './features/movies/movies-route-search'
import { PodcastsCollectionPage } from './features/podcasts/podcasts-collection-page'
import { parsePodcastsRouteSearch } from './features/podcasts/podcasts-route-search'
import { MusicCollectionPage } from './features/music/music-collection-page'
import { parseMusicRouteSearch } from './features/music/music-route-search'
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

const articlesArchiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/articles/archive',
  validateSearch: parseArticlesRouteSearch,
  component: () => <ArticlesCollectionPage section="archive" />,
})
const articlesQueueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/articles/queue',
  validateSearch: parseArticlesRouteSearch,
  component: () => <ArticlesCollectionPage section="queue" />,
})
const articlesFeedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/articles/feed',
  validateSearch: parseArticlesRouteSearch,
  component: () => <ArticlesCollectionPage section="feed" />,
})

const podcastsArchiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/podcasts/archive',
  validateSearch: parsePodcastsRouteSearch,
  component: () => <PodcastsCollectionPage view="archive" />,
})
const podcastsQueueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/podcasts/queue',
  validateSearch: parsePodcastsRouteSearch,
  component: () => <PodcastsCollectionPage view="queue" />,
})
const podcastsFollowingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/podcasts/following',
  validateSearch: parsePodcastsRouteSearch,
  component: () => <PodcastsCollectionPage view="following" />,
})
const musicTracksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/music/tracks',
  validateSearch: parseMusicRouteSearch,
  component: () => <MusicCollectionPage view="tracks" />,
})
const musicAlbumsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/music/albums',
  validateSearch: parseMusicRouteSearch,
  component: () => <MusicCollectionPage view="albums" />,
})
const musicArtistsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/music/artists',
  validateSearch: parseMusicRouteSearch,
  component: () => <MusicCollectionPage view="artists" />,
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
  articlesArchiveRoute,
  articlesQueueRoute,
  articlesFeedRoute,
  podcastsArchiveRoute,
  podcastsQueueRoute,
  podcastsFollowingRoute,
  musicTracksRoute,
  musicAlbumsRoute,
  musicArtistsRoute,
  connectionsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
