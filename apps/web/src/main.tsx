import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

import { router } from './router'
import {
  browserCacheStorage,
  createAppQueryClient,
  persistLibraryCache,
  startInitialPrefetch,
} from './library-cache'
import './styles.css'

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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
