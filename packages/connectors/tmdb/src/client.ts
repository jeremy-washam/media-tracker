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
})

const searchResponseSchema = z.object({
  page: z.number().int().nonnegative(),
  results: z.array(searchResultSchema),
  total_pages: z.number().int().nonnegative(),
  total_results: z.number().int().nonnegative(),
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
})

const findResponseSchema = z.object({ movie_results: z.array(searchResultSchema).default([]) })

export type TmdbConfiguration = z.infer<typeof configurationSchema>
export type TmdbMovieSearchResult = z.infer<typeof searchResultSchema>
export type TmdbMovieDetails = z.infer<typeof movieDetailsSchema>

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
        append_to_response: 'credits,external_ids,images,alternative_titles',
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

  async findMovieByImdb(imdbId: string): Promise<TmdbMovieSearchResult[]> {
    const response = await this.get(
      `/3/find/${encodeURIComponent(imdbId)}`,
      findResponseSchema,
      new URLSearchParams({ external_source: 'imdb_id', language: 'en-US' }),
    )
    return response.data.movie_results
  }

  private async get<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
    parameters?: URLSearchParams,
  ): Promise<{ data: z.output<Schema>; etag: string | null }> {
    const url = new URL(path, 'https://api.themoviedb.org')
    if (parameters !== undefined) url.search = parameters.toString()
    let response: Response
    try {
      response = await this.request(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new TmdbApiError(408, null)
      throw error
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
