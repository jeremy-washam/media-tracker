export interface PodcastsRouteSearch {
  q?: string | undefined
  item?: string | undefined
  kind?: 'episode' | 'show' | undefined
  layout?: 'grid' | 'list' | undefined
  sort?: string | undefined
  direction?: 'asc' | 'desc' | undefined
  following?: 'all' | 'following' | 'not_following' | undefined
  show?: string[] | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  dateUnknown?: boolean | undefined
  publishedFrom?: string | undefined
  publishedTo?: string | undefined
  publishedUnknown?: boolean | undefined
  duration?: Array<'under30' | '30to59' | '1to2hours' | 'over2hours' | 'unknown'> | undefined
  publisher?: string[] | undefined
  language?: string[] | undefined
  libraryEpisodes?: Array<'archive' | 'queue' | 'none'> | undefined
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function oneOf<T extends string>(value: unknown, choices: readonly T[]): T | undefined {
  return typeof value === 'string' && choices.includes(value as T) ? (value as T) : undefined
}

function values(value: unknown): string[] {
  return (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((item) => item.trim())
    .filter(Boolean)
}

function manyOf<T extends string>(value: unknown, choices: readonly T[]): T[] {
  return [...new Set(values(value).filter((item): item is T => choices.includes(item as T)))]
}

function flag(value: unknown): boolean | undefined {
  return value === true || value === 'true' || value === '1' ? true : undefined
}

export function parsePodcastsRouteSearch(value: Record<string, unknown>): PodcastsRouteSearch {
  return {
    ...(string(value.q) ? { q: string(value.q) } : {}),
    ...(string(value.item) ? { item: string(value.item) } : {}),
    ...(oneOf(value.kind, ['episode', 'show'] as const)
      ? { kind: oneOf(value.kind, ['episode', 'show'] as const) }
      : {}),
    ...(oneOf(value.layout, ['grid', 'list'] as const)
      ? { layout: oneOf(value.layout, ['grid', 'list'] as const) }
      : {}),
    ...(string(value.sort) ? { sort: string(value.sort) } : {}),
    ...(oneOf(value.direction, ['asc', 'desc'] as const)
      ? { direction: oneOf(value.direction, ['asc', 'desc'] as const) }
      : {}),
    ...(oneOf(value.following, ['all', 'following', 'not_following'] as const)
      ? { following: oneOf(value.following, ['all', 'following', 'not_following'] as const) }
      : {}),
    ...(values(value.show).length ? { show: values(value.show) } : {}),
    ...(string(value.dateFrom) ? { dateFrom: string(value.dateFrom) } : {}),
    ...(string(value.dateTo) ? { dateTo: string(value.dateTo) } : {}),
    ...(flag(value.dateUnknown) ? { dateUnknown: true } : {}),
    ...(string(value.publishedFrom) ? { publishedFrom: string(value.publishedFrom) } : {}),
    ...(string(value.publishedTo) ? { publishedTo: string(value.publishedTo) } : {}),
    ...(flag(value.publishedUnknown) ? { publishedUnknown: true } : {}),
    ...(manyOf(value.duration, ['under30', '30to59', '1to2hours', 'over2hours', 'unknown'] as const)
      .length
      ? {
          duration: manyOf(value.duration, [
            'under30',
            '30to59',
            '1to2hours',
            'over2hours',
            'unknown',
          ] as const),
        }
      : {}),
    ...(values(value.publisher).length ? { publisher: values(value.publisher) } : {}),
    ...(values(value.language).length ? { language: values(value.language) } : {}),
    ...(manyOf(value.libraryEpisodes, ['archive', 'queue', 'none'] as const).length
      ? { libraryEpisodes: manyOf(value.libraryEpisodes, ['archive', 'queue', 'none'] as const) }
      : {}),
  }
}

export function podcastQuerySearch(search: PodcastsRouteSearch) {
  const result = { ...search }
  delete result.item
  delete result.kind
  delete result.layout
  return result
}

export function normalizePodcastSearch(
  search: PodcastsRouteSearch,
  view: 'archive' | 'queue' | 'following',
) {
  const result = { ...search }
  const supported =
    view === 'following'
      ? ['title', 'publisher', 'episodeCount', 'savedAt', 'relevance']
      : view === 'archive'
        ? ['activityAt', 'observedTime', 'publishedAt', 'duration', 'title', 'show', 'relevance']
        : ['savedAt', 'publishedAt', 'duration', 'title', 'show', 'relevance']
  if (result.sort && !supported.includes(result.sort)) {
    delete result.sort
    delete result.direction
  }
  if (result.sort === 'relevance' && !result.q) {
    delete result.sort
    delete result.direction
  }
  if (view === 'following') {
    delete result.show
    delete result.following
    delete result.duration
    delete result.publishedFrom
    delete result.publishedTo
    delete result.publishedUnknown
  } else {
    delete result.publisher
    delete result.language
    delete result.libraryEpisodes
  }
  return result
}
