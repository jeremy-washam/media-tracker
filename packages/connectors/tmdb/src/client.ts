import { z } from 'zod'

const nullableString = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? null)
const nullableNumber = z
  .number()
  .nullable()
  .optional()
  .transform((value) => value ?? null)

const imageSchema = z.object({
  file_path: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  iso_639_1: nullableString,
})

const configurationSchema = z.object({
  images: z.object({
    secure_base_url: z.string().url(),
    poster_sizes: z.array(z.string()),
    backdrop_sizes: z.array(z.string()),
  }),
})

const searchResultSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  original_title: z.string(),
  release_date: nullableString,
  poster_path: nullableString,
  vote_count: z.number().int().nonnegative().default(0),
})

const searchResponseSchema = z.object({
  page: z.number().int().nonnegative(),
  results: z.array(searchResultSchema),
  total_pages: z.number().int().nonnegative(),
  total_results: z.number().int().nonnegative(),
})

const tvSearchResultSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  original_name: z.string(),
  first_air_date: nullableString,
  vote_count: z.number().int().nonnegative().default(0),
})

const tvSearchResponseSchema = z.object({ results: z.array(tvSearchResultSchema) })

const tvDetailsSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  original_name: z.string(),
  original_language: nullableString,
  overview: nullableString,
  first_air_date: nullableString,
  poster_path: nullableString,
  backdrop_path: nullableString,
  tagline: nullableString,
  status: nullableString,
  vote_average: nullableNumber,
  vote_count: z.number().int().nonnegative().default(0),
  created_by: z.array(z.object({ name: z.string() }).passthrough()).default([]),
  genres: z.array(z.object({ name: z.string() }).passthrough()).default([]),
  production_countries: z.array(z.object({ iso_3166_1: z.string(), name: z.string() })).default([]),
  credits: z
    .object({
      cast: z
        .array(z.object({ name: z.string(), character: nullableString }).passthrough())
        .default([]),
    })
    .default({ cast: [] }),
})

const movieDetailsSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  original_title: z.string(),
  original_language: nullableString,
  overview: nullableString,
  release_date: nullableString,
  runtime: nullableNumber,
  poster_path: nullableString,
  backdrop_path: nullableString,
  tagline: nullableString,
  imdb_id: nullableString,
  status: nullableString,
  vote_average: nullableNumber,
  vote_count: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  genres: z.array(z.object({ id: z.number().int(), name: z.string() })).default([]),
  production_countries: z.array(z.object({ iso_3166_1: z.string(), name: z.string() })).default([]),
  credits: z
    .object({
      cast: z
        .array(
          z.object({
            id: z.number().int(),
            credit_id: z.string(),
            name: z.string(),
            character: nullableString,
            order: z.number().int().nonnegative(),
          }),
        )
        .default([]),
      crew: z
        .array(
          z.object({
            id: z.number().int(),
            credit_id: z.string(),
            name: z.string(),
            job: z.string(),
            department: z.string().optional(),
          }),
        )
        .default([]),
    })
    .default({ cast: [], crew: [] }),
  images: z
    .object({
      posters: z.array(imageSchema).default([]),
      backdrops: z.array(imageSchema).default([]),
    })
    .default({ posters: [], backdrops: [] }),
  external_ids: z.object({ imdb_id: nullableString }).passthrough().default({ imdb_id: null }),
  alternative_titles: z
    .object({
      titles: z.array(z.object({ iso_3166_1: z.string(), title: z.string() })).default([]),
    })
    .default({ titles: [] }),
  release_dates: z
    .object({
      results: z.array(
        z.object({
          iso_3166_1: z.string(),
          release_dates: z.array(z.object({ release_date: z.string() }).passthrough()),
        }),
      ),
    })
    .default({ results: [] }),
})

const findResponseSchema = z.object({ movie_results: z.array(searchResultSchema).default([]) })

export type TmdbConfiguration = z.infer<typeof configurationSchema>
export type TmdbMovieSearchResult = z.infer<typeof searchResultSchema>
export type TmdbMovieDetails = z.infer<typeof movieDetailsSchema>
export type TmdbTvSearchResult = z.infer<typeof tvSearchResultSchema>
export type TmdbTvDetails = z.infer<typeof tvDetailsSchema>

export class TmdbApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds: number | null,
  ) {
    super(`TMDB request failed with status ${status}`)
    this.name = 'TmdbApiError'
  }

  get retryable() {
    return this.status === 408 || this.status === 429 || this.status >= 500
  }
}

export class TmdbClient {
  constructor(
    private readonly token: string,
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async configuration(): Promise<{ data: TmdbConfiguration; etag: string | null }> {
    return this.get('/3/configuration', configurationSchema)
  }

  async movieDetails(movieId: number): Promise<{ data: TmdbMovieDetails; etag: string | null }> {
    return this.get(
      `/3/movie/${movieId}`,
      movieDetailsSchema,
      new URLSearchParams({
        language: 'en-US',
        append_to_response: 'credits,external_ids,images,alternative_titles,release_dates',
        include_image_language: 'en,null',
      }),
    )
  }

  async searchMovie(title: string, year: string): Promise<TmdbMovieSearchResult[]> {
    const response = await this.get(
      '/3/search/movie',
      searchResponseSchema,
      new URLSearchParams({
        query: title,
        primary_release_year: year,
        language: 'en-US',
        include_adult: 'false',
        page: '1',
      }),
    )
    return response.data.results
  }

  async searchMovieWithoutYear(title: string): Promise<TmdbMovieSearchResult[]> {
    const response = await this.get(
      '/3/search/movie',
      searchResponseSchema,
      new URLSearchParams({
        query: title,
        language: 'en-US',
        include_adult: 'false',
        page: '1',
      }),
    )
    return response.data.results
  }

  async findMovieByImdb(imdbId: string): Promise<TmdbMovieSearchResult[]> {
    const response = await this.get(
      `/3/find/${encodeURIComponent(imdbId)}`,
      findResponseSchema,
      new URLSearchParams({ external_source: 'imdb_id', language: 'en-US' }),
    )
    return response.data.movie_results
  }

  async searchTv(title: string, year: string): Promise<TmdbTvSearchResult[]> {
    const response = await this.get(
      '/3/search/tv',
      tvSearchResponseSchema,
      new URLSearchParams({
        query: title,
        first_air_date_year: year,
        language: 'en-US',
        include_adult: 'false',
        page: '1',
      }),
    )
    return response.data.results
  }

  async tvDetails(tvId: number): Promise<{ data: TmdbTvDetails; etag: string | null }> {
    return this.get(
      `/3/tv/${tvId}`,
      tvDetailsSchema,
      new URLSearchParams({
        language: 'en-US',
        append_to_response: 'credits',
      }),
    )
  }

  private async get<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
    parameters?: URLSearchParams,
  ): Promise<{ data: z.output<Schema>; etag: string | null }> {
    const url = new URL(path, 'https://api.themoviedb.org')
    if (parameters !== undefined) url.search = parameters.toString()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      const request = this.request
      response = await request(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new TmdbApiError(408, null)
      throw error
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after')
      throw new TmdbApiError(
        response.status,
        retryAfter === null || Number.isNaN(Number(retryAfter)) ? null : Number(retryAfter),
      )
    }
    return { data: schema.parse(await response.json()), etag: response.headers.get('etag') }
  }
}

export function normalizeTmdbTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function selectExactTitleYearCandidates(
  results: readonly TmdbMovieSearchResult[],
  title: string,
  year: string,
): TmdbMovieSearchResult[] {
  const normalized = normalizeTmdbTitle(title)
  return results.filter(
    (candidate) =>
      candidate.release_date?.slice(0, 4) === year &&
      [candidate.title, candidate.original_title].some(
        (candidateTitle) => normalizeTmdbTitle(candidateTitle) === normalized,
      ),
  )
}

/** Popularity is not an identifier; a large voting lead is a bounded tie-break only. */
export function selectDominantVoteCandidate<T extends { vote_count: number }>(
  candidates: readonly T[],
): T | null {
  if (candidates.length < 2) return null
  const ordered = [...candidates].sort((a, b) => b.vote_count - a.vote_count)
  const first = ordered[0]!
  const second = ordered[1]!
  return first.vote_count >= 20 && first.vote_count >= Math.max(1, second.vote_count) * 20
    ? first
    : null
}

export function movieHasReleaseYear(details: TmdbMovieDetails, year: string): boolean {
  return details.release_dates.results.some((country) =>
    country.release_dates.some((date) => date.release_date.slice(0, 4) === year),
  )
}

export function movieHasExactTitle(details: TmdbMovieDetails, title: string): boolean {
  const normalized = normalizeTmdbTitle(title)
  return [
    details.title,
    details.original_title,
    ...details.alternative_titles.titles.map((alternate) => alternate.title),
  ].some((value) => normalizeTmdbTitle(value) === normalized)
}
