import { describe, expect, it, vi } from 'vitest'

import { ReadwiseApiError, fetchReaderArchivePage, fetchReaderDocumentPage } from './client'

describe('Reader API client', () => {
  it('requests bounded Archive pages and preserves their response bytes', async () => {
    const body = JSON.stringify({ results: [{ title: 'Unicode — preserved' }] })
    const fetchMock = vi.fn(async (...arguments_: Parameters<typeof fetch>) => {
      expect(arguments_[0]).toBeDefined()
      return new Response(body)
    })
    const fetcher = fetchMock as unknown as typeof fetch

    const response = await fetchReaderArchivePage({
      token: 'synthetic-token',
      pageCursor: 'next-page',
      fetcher,
    })

    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!
    const url = new URL(String(requestUrl))
    expect(url.searchParams.get('location')).toBe('archive')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('pageCursor')).toBe('next-page')
    expect((requestInit?.headers as Record<string, string>).authorization).toBe(
      'Token synthetic-token',
    )
    expect(new TextDecoder().decode(response.bytes)).toBe(body)
    expect(response.body).toBe(body)
  })

  it('can reconcile every updated location without an Archive filter', async () => {
    const fetchMock = vi.fn(async (...arguments_: Parameters<typeof fetch>) => {
      expect(arguments_[0]).toBeDefined()
      return Response.json({ results: [] })
    })
    const fetcher = fetchMock as unknown as typeof fetch

    await fetchReaderDocumentPage({
      token: 'synthetic-token',
      updatedAfter: '2026-09-12T11:55:00.000Z',
      fetcher,
    })

    const url = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(url.searchParams.has('location')).toBe(false)
    expect(url.searchParams.get('updatedAfter')).toBe('2026-09-12T11:55:00.000Z')
  })

  it('reports status and retry timing without exposing response content', async () => {
    const fetcher = vi.fn(async (...arguments_: Parameters<typeof fetch>) => {
      expect(arguments_[0]).toBeDefined()
      return new Response('private error body', {
        status: 429,
        headers: { 'retry-after': '3' },
      })
    }) as unknown as typeof fetch

    const error = await fetchReaderArchivePage({ token: 'synthetic-token', fetcher }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(ReadwiseApiError)
    expect(error).toMatchObject({ status: 429, retryAfter: '3' })
    expect((error as Error).message).not.toContain('private error body')
  })
})
