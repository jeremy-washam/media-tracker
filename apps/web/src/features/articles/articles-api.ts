import {
  ArticleDetailSchema,
  ArticleHighlightsResponseSchema,
  ArticleHistoryResponseSchema,
  ArticlesResponseSchema,
  type ArticleDetail,
  type ArticleHighlightsResponse,
  type ArticleHistoryResponse,
  type ArticlesResponse,
} from '@media-tracker/contracts'
import type { ArticlesRouteSearch } from './articles-route-search'

export interface ArticlesRequest extends ArticlesRouteSearch {
  section: 'archive' | 'queue' | 'feed'
  cursor?: string
  limit: number
}
async function json(response: Response): Promise<unknown> {
  const body: unknown = await response.json()
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error?: { message?: unknown } }).error?.message
        : undefined
    throw new Error(typeof message === 'string' ? message : `Request failed (${response.status}).`)
  }
  return body
}
function query(request: object): URLSearchParams {
  const result = new URLSearchParams()
  for (const [key, value] of Object.entries(request)) {
    if (Array.isArray(value)) {
      if (value.length > 0) result.set(key, value.join(','))
    } else if (value !== undefined && value !== '' && value !== false)
      result.set(key, String(value))
  }
  return result
}
export async function fetchArticles(
  request: ArticlesRequest,
  signal?: AbortSignal,
): Promise<ArticlesResponse> {
  return ArticlesResponseSchema.parse(
    await json(
      await fetch(`/api/library/articles?${query(request)}`, {
        headers: { accept: 'application/json' },
        ...(signal ? { signal } : {}),
      }),
    ),
  )
}
export async function fetchArticle(id: string, signal?: AbortSignal): Promise<ArticleDetail> {
  return ArticleDetailSchema.parse(
    await json(
      await fetch(`/api/library/articles/${encodeURIComponent(id)}`, {
        headers: { accept: 'application/json' },
        ...(signal ? { signal } : {}),
      }),
    ),
  )
}
export async function fetchArticleHistory(
  id: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<ArticleHistoryResponse> {
  return ArticleHistoryResponseSchema.parse(
    await json(
      await fetch(
        `/api/library/articles/${encodeURIComponent(id)}/history?${query({ limit: 25, cursor })}`,
        { headers: { accept: 'application/json' }, ...(signal ? { signal } : {}) },
      ),
    ),
  )
}
export async function fetchArticleHighlights(
  id: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<ArticleHighlightsResponse> {
  return ArticleHighlightsResponseSchema.parse(
    await json(
      await fetch(
        `/api/library/articles/${encodeURIComponent(id)}/highlights?${query({ limit: 20, cursor })}`,
        { headers: { accept: 'application/json' }, ...(signal ? { signal } : {}) },
      ),
    ),
  )
}
