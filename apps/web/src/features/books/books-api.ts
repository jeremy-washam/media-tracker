import { checkLibraryCursorResponse } from '../../library-api'
import {
  BookDetailSchema,
  BookHistoryResponseSchema,
  BooksResponseSchema,
  type BookDetail,
  type BookHistoryResponse,
  type BooksResponse,
} from '@media-tracker/contracts'

export interface BooksRequest {
  section: 'archive' | 'queue'
  q?: string | undefined
  format?: string[] | undefined
  series?: string[] | undefined
  genre?: string[] | undefined
  finishedMode?: 'any' | 'range' | 'unavailable' | undefined
  finishedFrom?: string | undefined
  finishedTo?: string | undefined
  publishedMode?: 'any' | 'range' | 'unavailable' | undefined
  publishedFrom?: string | undefined
  publishedTo?: string | undefined
  addedMode?: 'any' | 'range' | 'unavailable' | undefined
  addedFrom?: string | undefined
  addedTo?: string | undefined
  ratingMode?: 'any' | 'rated' | 'unrated' | 'minimum' | undefined
  minRating?: number | undefined
  sort?: string | undefined
  direction?: 'asc' | 'desc' | undefined
  layout?: 'grid' | 'list' | undefined
  cursor?: string | undefined
  limit?: number | undefined
}

async function json(response: Response): Promise<unknown> {
  const body: unknown = await response.json()
  checkLibraryCursorResponse(response.status, body)
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error?: { message?: unknown } }).error?.message
        : undefined
    throw new Error(typeof message === 'string' ? message : `Request failed (${response.status}).`)
  }
  return body
}

function booksSearch(request: BooksRequest): URLSearchParams {
  const search = new URLSearchParams()
  search.set('section', request.section)
  for (const key of ['format', 'series', 'genre'] as const) {
    const values = request[key]
    if (values && values.length > 0) search.set(key, values.join(','))
  }
  for (const [key, value] of Object.entries(request)) {
    if (
      key === 'section' ||
      key === 'format' ||
      key === 'series' ||
      key === 'genre' ||
      value === undefined ||
      value === ''
    ) {
      continue
    }
    search.set(key, String(value))
  }
  return search
}

export async function fetchBooks(
  request: BooksRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BooksResponse> {
  const response = await fetcher(`/api/library/books?${booksSearch(request)}`, {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  return BooksResponseSchema.parse(await json(response))
}

export async function fetchBook(
  mediaItemId: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BookDetail> {
  const response = await fetcher(`/api/library/books/${encodeURIComponent(mediaItemId)}`, {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  return BookDetailSchema.parse(await json(response))
}

export async function fetchBookHistory(
  mediaItemId: string,
  cursor?: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BookHistoryResponse> {
  const search = new URLSearchParams({ limit: '20' })
  if (cursor !== undefined) search.set('cursor', cursor)
  const response = await fetcher(
    `/api/library/books/${encodeURIComponent(mediaItemId)}/history?${search}`,
    { headers: { accept: 'application/json' }, ...(signal === undefined ? {} : { signal }) },
  )
  return BookHistoryResponseSchema.parse(await json(response))
}
