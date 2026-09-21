import { describe, expect, it, vi } from 'vitest'

import { TmdbApiError, TmdbClient, selectExactTitleYearCandidates } from './client'

describe('TmdbClient', () => {
  it('selects only a unique exact normalized title and year', () => {
    const results = [
      {
        id: 1,
        title: 'The Test!',
        original_title: 'The Test!',
        release_date: '2020-01-02',
        poster_path: null,
      },
      {
        id: 2,
        title: 'The Test',
        original_title: 'The Test',
        release_date: '2021-01-02',
        poster_path: null,
      },
      {
        id: 3,
        title: 'A Test',
        original_title: 'A Test',
        release_date: '2020-01-02',
        poster_path: null,
      },
    ]
    expect(
      selectExactTitleYearCandidates(results, 'The Test', '2020').map((value) => value.id),
    ).toEqual([1])
  })

  it('uses bearer authentication and validates details', async () => {
    const request = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret')
      return new Response(
        JSON.stringify({
          id: 1,
          title: 'Movie',
          original_title: 'Movie',
          original_language: 'en',
          overview: null,
          release_date: '2020-01-01',
          runtime: 90,
          poster_path: null,
          backdrop_path: null,
          tagline: null,
          imdb_id: null,
          status: 'Released',
          vote_average: 7,
          vote_count: 3,
          genres: [],
          production_countries: [],
          credits: { cast: [], crew: [] },
          images: { posters: [], backdrops: [] },
          external_ids: { imdb_id: null },
          alternative_titles: { titles: [] },
        }),
        { status: 200, headers: { etag: 'profile-etag' } },
      )
    })
    await expect(
      new TmdbClient('secret', request as typeof fetch).movieDetails(1),
    ).resolves.toMatchObject({
      data: { id: 1, title: 'Movie' },
      etag: 'profile-etag',
    })
  })

  it('classifies rate limits as retryable without exposing response bodies', async () => {
    const request = vi.fn(
      async () => new Response('private', { status: 429, headers: { 'retry-after': '3' } }),
    )
    await expect(
      new TmdbClient('secret', request as typeof fetch).configuration(),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 3,
      retryable: true,
    } satisfies Partial<TmdbApiError>)
  })

  it('classifies request timeouts as retryable', async () => {
    const request = vi.fn(async () => {
      throw new DOMException('timed out', 'AbortError')
    })
    await expect(
      new TmdbClient('secret', request as typeof fetch).configuration(),
    ).rejects.toMatchObject({ status: 408, retryable: true } satisfies Partial<TmdbApiError>)
  })
})
