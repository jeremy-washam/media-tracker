import contentStyles from '@/components/page-content.module.css'
import historyStyles from '@/pages/history-page.module.css'
import controlsStyles from '@/components/library-controls.module.css'
import connectionsStyles from '@/pages/connections-page.module.css'
import { cn } from '@/lib/utils'
import { AppButton as Button } from '@/components/ui-patterns'
import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'

import type { MediaSummary } from '@media-tracker/contracts'

import { fetchMedia } from '../api'

const mediaTypeNames = {
  article: 'Article',
  video: 'Video',
  podcast_episode: 'Podcast',
  movie: 'Movie',
  book: 'Book',
  song: 'Song',
} as const

const mediaTypePluralNames = {
  article: 'Articles',
  video: 'Videos',
  podcast_episode: 'Podcasts',
  movie: 'Movies',
  book: 'Books',
  song: 'Songs',
} as const

type MediaType = MediaSummary['type']
type MediaFilter = 'all' | MediaType
const mediaTypes = Object.keys(mediaTypeNames) as MediaType[]

export function HistoryPage() {
  const [filter, setFilter] = useState<MediaFilter>('all')
  const media = useInfiniteQuery({
    queryKey: ['media', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchMedia(fetch, {
        ...(filter === 'all' ? {} : { type: filter }),
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const items = media.data?.pages.flatMap((page) => page.data) ?? []
  const counts = media.data?.pages[0]?.counts ?? {
    article: 0,
    video: 0,
    podcast_episode: 0,
    movie: 0,
    book: 0,
    song: 0,
  }
  const totalCount = media.data?.pages[0]?.totalCount ?? 0
  const filteredCount = media.data?.pages[0]?.filteredCount ?? 0
  const typeCount = Object.values(counts).filter((count) => count > 0).length
  const filteredItems = items

  return (
    <section
      className={contentStyles['page-stack']}
      aria-labelledby="history-title"
      data-ui="page-stack"
    >
      <div className={contentStyles['page-heading']}>
        <p className={contentStyles['eyebrow']} data-ui="eyebrow">
          Personal ledger
        </p>
        <h1 id="history-title">Your media history, in one place.</h1>
        <p>
          Movies, books, podcasts, articles, and videos from your connected services appear here.
        </p>
      </div>

      <div className={historyStyles['summary-grid']} aria-label="History summary">
        <article className={historyStyles['summary-card']}>
          <span>Items imported</span>
          <strong>{media.isPending ? '—' : totalCount}</strong>
          <small>{totalCount === 0 ? 'Waiting for the first import' : 'In your Archive'}</small>
        </article>
        <article className={historyStyles['summary-card']}>
          <span>Media types</span>
          <strong>{media.isPending ? '—' : typeCount}</strong>
          <small>Across the current Archive</small>
        </article>
        <article className={historyStyles['summary-card']}>
          <span>Current view</span>
          <strong>{media.isPending ? '—' : filteredCount}</strong>
          <small>{filter === 'all' ? 'All media' : mediaTypePluralNames[filter]}</small>
        </article>
      </div>

      {media.isError ? (
        <div className={cn(contentStyles['notice'], 'notice-error')} role="alert">
          Your Archive could not be loaded from the local API.
        </div>
      ) : null}

      {!media.isPending && !media.isError && totalCount === 0 ? (
        <div className={contentStyles['empty-panel']}>
          <div className={contentStyles['empty-mark']} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h2>No media yet</h2>
            <p>Open Connections to import or sync your media history.</p>
          </div>
        </div>
      ) : null}

      {totalCount > 0 ? (
        <>
          <div className={historyStyles['media-filters']} aria-label="Filter Archive by media type">
            <Button
              variant="outline"
              type="button"
              className={filter === 'all' ? undefined : undefined}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All <span>{totalCount}</span>
            </Button>
            {mediaTypes.map((type) => (
              <Button
                variant="outline"
                type="button"
                className={filter === type ? undefined : undefined}
                aria-pressed={filter === type}
                onClick={() => setFilter(type)}
                key={type}
              >
                {mediaTypePluralNames[type]} <span>{counts[type]}</span>
              </Button>
            ))}
          </div>

          <div
            className={historyStyles['media-list']}
            aria-label={`${filter === 'all' ? 'All media' : mediaTypePluralNames[filter]} Archive`}
          >
            {filteredItems.map((item) => (
              <article className={historyStyles['media-row']} key={item.id}>
                <span
                  className={cn(
                    historyStyles['media-type-mark'],
                    historyStyles[`media-type-${item.type}`],
                  )}
                  aria-hidden="true"
                >
                  {mediaTypeNames[item.type].slice(0, 1)}
                </span>
                <div>
                  <h2>{item.title ?? 'Untitled item'}</h2>
                  <p>{mediaTypeNames[item.type]}</p>
                </div>
              </article>
            ))}
            {filteredItems.length === 0 ? (
              <div className={controlsStyles['filter-empty']}>
                No {mediaTypePluralNames[filter as MediaType]?.toLowerCase() ?? 'items'} imported
                yet.
              </div>
            ) : null}
          </div>
          {media.hasNextPage ? (
            <Button
              variant="outline"
              type="button"

              disabled={media.isFetchingNextPage}
              onClick={() => void media.fetchNextPage()}
              data-ui="sync-button"
            >
              {media.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
          <p className={connectionsStyles['checkpoint-note']}>
            Showing {items.length} of {filteredCount} items.
          </p>
        </>
      ) : null}
    </section>
  )
}
