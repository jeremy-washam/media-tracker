// Keep shared contracts before feature styles; verify visual parity when changing this order.
import './styles.css'
import './components/app-shell.module.css'
import './components/library-workspace.module.css'
import './components/library-controls.module.css'
import './components/inspector.module.css'
import './components/media-presentation.module.css'
import './features/books/books.module.css'
import './features/movies/movies.module.css'
import './features/articles/articles.module.css'
import './features/music/music.module.css'
import './features/videos/videos.module.css'
import './components/page-content.module.css'
import './pages/connections-page.module.css'
import './components/collection-pagination.module.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { IconContext } from './components/icons'

import { router } from './router'
import {
  browserCacheStorage,
  createAppQueryClient,
  persistLibraryCache,
  startInitialPrefetch,
} from './library-cache'

const storage = browserCacheStorage()
const queryClient = createAppQueryClient(storage)
const stopPersistence = persistLibraryCache(queryClient, storage)
const stopPrefetch = startInitialPrefetch(queryClient, () => router.state.location.pathname)

import.meta.hot?.dispose(() => {
  stopPrefetch()
  stopPersistence()
})

const container = document.getElementById('root')

if (!container) {
  throw new Error('The application root element is missing.')
}

createRoot(container).render(
  <StrictMode>
    <IconContext.Provider
      value={{ size: 24, weight: 'regular', 'aria-hidden': true, focusable: false }}
    >
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IconContext.Provider>
  </StrictMode>,
)
