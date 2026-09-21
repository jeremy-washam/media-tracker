import { describe, expect, it, vi } from 'vitest'

import {
  TmdbApiError,
  TmdbClient,
  movieHasExactTitle,
  movieHasReleaseYear,
  selectDominantVoteCandidate,
  selectExactTitleYearCandidates,
  type TmdbMovieDetails,
} from './client'

describe('TmdbClient', () => {
  it('selects only a unique exact normalized title and year', () => {
    const results = [
      {
        id: 1,
        title: 'The Test!',
        original_title: 'The Test!',
        release_date: '2020-01-02',
        poster_path: null,
        vote_count: 3,
      },
      {
        id: 2,
        title: 'The Test',
        original_title: 'The Test',
        release_date: '2021-01-02',
        poster_path: null,
        vote_count: 3,
      },
      {
        id: 3,
        title: 'A Test',
        original_title: 'A Test',
        release_date: '2020-01-02',
        poster_path: null,
        vote_count: 3,
      },
    ]
    expect(
      selectExactTitleYearCandidates(results, 'The Test', '2020').map((value) => value.id),
    ).toEqual([1])
  })

  it('uses bearer authentication and validates details', async () => {
    const request = vi.fn(async function (
      this: unknown,
      _input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) {
      expect(this).toBeUndefined()
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

  it('uses a decisive vote lead only as a tie-break among otherwise exact candidates', () => {
    expect(
      selectDominantVoteCandidate([
        { id: 1, vote_count: 100 },
        { id: 2, vote_count: 4 },
      ])?.id,
    ).toBe(1)
    expect(
      selectDominantVoteCandidate([
        { id: 1, vote_count: 100 },
        { id: 2, vote_count: 90 },
      ]),
    ).toBeNull()
    expect(
      selectDominantVoteCandidate([
        { id: 1, vote_count: 19 },
        { id: 2, vote_count: 0 },
      ]),
    ).toBeNull()
  })

  it('verifies the source year against actual releases and an exact alternative title', () => {
    const movie = {
      title: 'Warriors of the Wind',
      original_title: '風の谷のナウシカ',
      release_date: '1985-06-13',
      alternative_titles: {
        titles: [{ iso_3166_1: 'US', title: 'Nausicaä of the Valley of the Wind' }],
      },
      release_dates: {
        results: [{ iso_3166_1: 'JP', release_dates: [{ release_date: '1984-03-11' }] }],
      },
    } as TmdbMovieDetails
    expect(movieHasExactTitle(movie, 'Nausicaä of the Valley of the Wind')).toBe(true)
    expect(movieHasReleaseYear(movie, '1984')).toBe(true)
    expect(movieHasReleaseYear(movie, '1983')).toBe(false)
  })

  it('searches and reads TV identities separately from movies', async () => {
    const request = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      if (url.pathname === '/3/search/tv') {
        expect(url.searchParams.get('first_air_date_year')).toBe('2014')
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 61617,
                name: 'Over the Garden Wall',
                original_name: 'Over the Garden Wall',
                first_air_date: '2014-11-03',
                vote_count: 1822,
              },
            ],
          }),
        )
      }
      expect(url.pathname).toBe('/3/tv/61617')
      return new Response(
        JSON.stringify({
          id: 61617,
          name: 'Over the Garden Wall',
          original_name: 'Over the Garden Wall',
          original_language: 'en',
          overview: 'A miniseries.',
          first_air_date: '2014-11-03',
          poster_path: '/poster.jpg',
          backdrop_path: null,
          tagline: null,
          status: 'Ended',
          vote_average: 8.6,
          vote_count: 1822,
          created_by: [{ name: 'Creator One' }],
          genres: [{ name: 'Animation' }],
          production_countries: [{ iso_3166_1: 'US', name: 'United States' }],
          credits: { cast: [{ name: 'Actor One', character: 'Wirt' }] },
        }),
      )
    })
    const client = new TmdbClient('secret', request as typeof fetch)
    expect((await client.searchTv('Over the Garden Wall', '2014'))[0]?.id).toBe(61617)
    expect((await client.tvDetails(61617)).data.created_by[0]?.name).toBe('Creator One')
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
