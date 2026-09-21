import { z } from 'zod'

const nullableString = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? null)
const thumbnailSchema = z.object({
  url: z.string().url(),
  width: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  height: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
})
const thumbnailsSchema = z.record(z.string(), thumbnailSchema).default({})

const videoSchema = z.object({
  id: z.string(),
  etag: nullableString,
  snippet: z.object({
    publishedAt: nullableString,
    channelId: nullableString,
    title: z.string(),
    description: z.string().default(''),
    thumbnails: thumbnailsSchema,
    channelTitle: nullableString,
    tags: z
      .array(z.string())
      .nullable()
      .optional()
      .transform((value) => value ?? []),
    categoryId: nullableString,
    liveBroadcastContent: nullableString,
  }),
  contentDetails: z.object({
    duration: nullableString,
    definition: nullableString,
    caption: nullableString,
    projection: nullableString,
    regionRestriction: z
      .object({ allowed: z.array(z.string()).optional(), blocked: z.array(z.string()).optional() })
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  }),
  status: z.object({
    uploadStatus: nullableString,
    privacyStatus: nullableString,
    embeddable: z
      .boolean()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    madeForKids: z
      .boolean()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  }),
  liveStreamingDetails: z
    .object({
      scheduledStartTime: nullableString,
      actualStartTime: nullableString,
      actualEndTime: nullableString,
    })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
})

const channelSchema = z.object({
  id: z.string(),
  etag: nullableString,
  snippet: z.object({
    title: z.string(),
    description: z.string().default(''),
    customUrl: nullableString,
    publishedAt: nullableString,
    thumbnails: thumbnailsSchema,
    country: nullableString,
  }),
})

const categorySchema = z.object({
  id: z.string(),
  snippet: z.object({ title: z.string(), assignable: z.boolean() }),
})

const videosResponseSchema = z.object({ items: z.array(videoSchema).default([]) })
const channelsResponseSchema = z.object({ items: z.array(channelSchema).default([]) })
const categoriesResponseSchema = z.object({ items: z.array(categorySchema).default([]) })

export type YoutubeApiVideo = z.infer<typeof videoSchema>
export type YoutubeApiChannel = z.infer<typeof channelSchema>
export type YoutubeApiCategory = z.infer<typeof categorySchema>

export class YoutubeApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds: number | null,
  ) {
    super(`YouTube Data API request failed with status ${status}`)
    this.name = 'YoutubeApiError'
  }

  get retryable() {
    return this.status === 408 || this.status === 429 || this.status >= 500
  }
}

export class YoutubeDataApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async videos(ids: readonly string[]): Promise<YoutubeApiVideo[]> {
    if (ids.length < 1 || ids.length > 50)
      throw new RangeError('YouTube video batches must contain 1 through 50 IDs')
    const response = await this.get(
      '/youtube/v3/videos',
      new URLSearchParams({
        id: ids.join(','),
        part: 'snippet,contentDetails,status,liveStreamingDetails',
      }),
      videosResponseSchema,
    )
    return response.items
  }

  async channels(ids: readonly string[]): Promise<YoutubeApiChannel[]> {
    if (ids.length < 1 || ids.length > 50)
      throw new RangeError('YouTube channel batches must contain 1 through 50 IDs')
    const response = await this.get(
      '/youtube/v3/channels',
      new URLSearchParams({ id: ids.join(','), part: 'snippet' }),
      channelsResponseSchema,
    )
    return response.items
  }

  async categories(regionCode = 'US'): Promise<YoutubeApiCategory[]> {
    const response = await this.get(
      '/youtube/v3/videoCategories',
      new URLSearchParams({ regionCode, part: 'snippet' }),
      categoriesResponseSchema,
    )
    return response.items
  }

  private async get<Schema extends z.ZodType>(
    path: string,
    parameters: URLSearchParams,
    schema: Schema,
  ): Promise<z.output<Schema>> {
    const url = new URL(path, 'https://www.googleapis.com')
    parameters.set('key', this.apiKey)
    url.search = parameters.toString()
    let response: Response
    try {
      response = await this.request(url, { signal: AbortSignal.timeout(this.timeoutMs) })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        throw new YoutubeApiError(408, null)
      throw error
    }
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after')
      throw new YoutubeApiError(
        response.status,
        retryAfter === null || Number.isNaN(Number(retryAfter)) ? null : Number(retryAfter),
      )
    }
    return schema.parse(await response.json())
  }
}

export function youtubeDurationMilliseconds(value: string | null): number | null {
  if (value === null) return null
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value)
  if (match === null) return null
  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  const seconds = Number(match[4] ?? 0)
  return Math.round((((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000)
}

export function bestYoutubeThumbnail(
  thumbnails: YoutubeApiVideo['snippet']['thumbnails'],
): string | null {
  const values = Object.values(thumbnails)
  return (
    values.sort(
      (left, right) =>
        (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0),
    )[0]?.url ?? null
  )
}
