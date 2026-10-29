import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchHardcoverUserId, parseHardcoverReadBook } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('Hardcover read-book parser', () => {
  it('keeps work, edition, rating, review, and finished-read facts distinct', () => {
    const book = parseHardcoverReadBook({
      id: 501,
      book_id: 701,
      edition_id: 801,
      status_id: 3,
      read_count: 2,
      rating: 4.5,
      review: 'A synthetic review.',
      reviewed_at: '2026-09-10T12:00:00Z',
      updated_at: '2026-09-11T18:30:00Z',
      book: {
        id: 701,
        canonical_id: null,
        title: 'A Synthetic Book',
        subtitle: 'Testing the Archive',
        release_date: '2020-04-12',
        release_year: 2020,
      },
      edition: {
        id: 801,
        canonical_id: null,
        isbn_10: '1234567890',
        isbn_13: '9781234567890',
        asin: 'B000SYNTH',
        audio_seconds: null,
      },
      user_book_reads: [
        {
          id: 901,
          edition_id: 801,
          finished_at: '2024-02-03',
          finished_at_precision: 3,
        },
      ],
    })

    expect(book).toMatchObject({
      userBookId: 501,
      bookId: 701,
      editionId: 801,
      readCount: 2,
      rating: 4.5,
      reviewedAt: '2026-09-10T12:00:00Z',
      title: 'A Synthetic Book',
      isbn13: '9781234567890',
    })
    expect(book.reads).toMatchObject([
      { id: 901, editionId: 801, finishedAt: '2024-02-03', finishedAtPrecision: 3 },
    ])
  })

  it('rejects malformed source rows instead of manufacturing an item', () => {
    expect(() => parseHardcoverReadBook({ id: 'not-an-id' })).toThrow()
  })

  it('retries a rate-limited GraphQL request using Retry-After', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { me: [{ id: 42 }] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchHardcoverUserId('synthetic-token')).resolves.toBe(42)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('Hardcover request failures', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  it.each([401, 403])(
    'does not retry terminal HTTP %s or expose response content',
    async (status) => {
      const request = vi.fn(async () => new Response('synthetic private body', { status }))
      vi.stubGlobal('fetch', request)
      await expect(fetchHardcoverUserId('synthetic-token')).rejects.toThrow(`returned ${status}`)
      expect(request).toHaveBeenCalledOnce()
    },
  )
  it.each([429, 500, 503])('bounds repeated HTTP %s failures to four attempts', async (status) => {
    vi.useFakeTimers()
    const request = vi.fn(
      async () => new Response(null, { status, headers: { 'retry-after': '1' } }),
    )
    vi.stubGlobal('fetch', request)
    const outcome = expect(fetchHardcoverUserId('synthetic-token')).rejects.toThrow(
      `returned ${status}`,
    )
    await vi.runAllTimersAsync()
    await outcome
    expect(request).toHaveBeenCalledTimes(4)
  })
  it.each([
    { header: '2', delay: 2000 },
    { header: 'Thu, 01 Jan 2026 00:00:02 GMT', delay: 2000 },
    { header: 'nonsense', delay: 500 },
  ])('honors bounded Retry-After $header', async ({ header, delay }) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': header } }),
      )
      .mockResolvedValueOnce(Response.json({ data: { me: [{ id: 42 }] } }))
    vi.stubGlobal('fetch', request)
    const outcome = expect(fetchHardcoverUserId('synthetic')).resolves.toBe(42)
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await outcome
    expect(request).toHaveBeenCalledTimes(2)
  })
  it.each(['999999', 'Thu, 01 Jan 2026 00:01:00 GMT'])(
    'defers immediately when Retry-After %s exceeds the attempt wait allowance',
    async (header) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const request = vi.fn(
        async () =>
          new Response(null, {
            status: 429,
            headers: { 'retry-after': header },
          }),
      )
      vi.stubGlobal('fetch', request)
      const outcome = expect(fetchHardcoverUserId('synthetic')).rejects.toThrow(
        "Retry-After exceeds this attempt's wait allowance",
      )
      await outcome
      expect(vi.getTimerCount()).toBe(0)
      expect(request).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(request).toHaveBeenCalledOnce()
    },
  )
  it.each([
    { errors: [{ message: 'synthetic GraphQL error' }] },
    { data: {} },
    { data: { me: [] } },
    { data: { me: [{ id: 'invalid' }] } },
  ])('rejects malformed GraphQL identity envelopes: %j', async (envelope) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(envelope)),
    )
    await expect(fetchHardcoverUserId('synthetic')).rejects.toThrow()
  })
})
