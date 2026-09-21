export interface VideosRouteSearch {
  q?: string | undefined
  item?: string | undefined
  channelItem?: string | undefined
  layout?: 'grid' | 'list' | undefined
  sort?: string | undefined
  direction?: 'asc' | 'desc' | undefined
  account?: string[] | undefined
  channel?: string[] | undefined
  watchedFrom?: string | undefined
  watchedTo?: string | undefined
  watchedUnknown?: boolean | undefined
  addedFrom?: string | undefined
  addedTo?: string | undefined
  addedUnknown?: boolean | undefined
  published?: 'range' | 'unknown' | undefined
  publishedFrom?: string | undefined
  publishedTo?: string | undefined
  duration?: 'under5' | '5to19' | '20to59' | '60plus' | undefined
  durationUnknown?: boolean | undefined
  watchCount?: 'all' | 'once' | 'rewatched' | undefined
  overlap?: 'all' | 'overlap' | 'not_overlap' | undefined
  format?:
    | Array<'live' | 'upcoming' | 'recorded_live' | 'youtube_music' | 'shorts' | 'premiere'>
    | undefined
  availability?: 'available' | 'unavailable' | 'unchecked' | undefined
  category?: string[] | undefined
}

function string(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : undefined
}

function values(value: unknown) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : value === undefined ? [] : [value])
        .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

function flag(value: unknown) {
  return value === true || value === 'true' ? true : undefined
}

export function parseVideosRouteSearch(value: Record<string, unknown>): VideosRouteSearch {
  const format = values(value.format).filter((item) =>
    ['live', 'upcoming', 'recorded_live', 'youtube_music', 'shorts', 'premiere'].includes(item),
  ) as VideosRouteSearch['format']
  return {
    ...(string(value.q) ? { q: string(value.q) } : {}),
    ...(string(value.item) ? { item: string(value.item) } : {}),
    ...(string(value.channelItem) ? { channelItem: string(value.channelItem) } : {}),
    ...(oneOf(value.layout, ['grid', 'list'] as const)
      ? { layout: oneOf(value.layout, ['grid', 'list'] as const) }
      : {}),
    ...(string(value.sort) ? { sort: string(value.sort) } : {}),
    ...(oneOf(value.direction, ['asc', 'desc'] as const)
      ? { direction: oneOf(value.direction, ['asc', 'desc'] as const) }
      : {}),
    ...(values(value.account).length ? { account: values(value.account) } : {}),
    ...(values(value.channel).length ? { channel: values(value.channel) } : {}),
    ...(string(value.watchedFrom) ? { watchedFrom: string(value.watchedFrom) } : {}),
    ...(string(value.watchedTo) ? { watchedTo: string(value.watchedTo) } : {}),
    ...(flag(value.watchedUnknown) ? { watchedUnknown: true } : {}),
    ...(string(value.addedFrom) ? { addedFrom: string(value.addedFrom) } : {}),
    ...(string(value.addedTo) ? { addedTo: string(value.addedTo) } : {}),
    ...(flag(value.addedUnknown) ? { addedUnknown: true } : {}),
    ...(oneOf(value.published, ['range', 'unknown'] as const)
      ? { published: oneOf(value.published, ['range', 'unknown'] as const) }
      : {}),
    ...(string(value.publishedFrom) ? { publishedFrom: string(value.publishedFrom) } : {}),
    ...(string(value.publishedTo) ? { publishedTo: string(value.publishedTo) } : {}),
    ...(oneOf(value.duration, ['under5', '5to19', '20to59', '60plus'] as const)
      ? { duration: oneOf(value.duration, ['under5', '5to19', '20to59', '60plus'] as const) }
      : {}),
    ...(flag(value.durationUnknown) ? { durationUnknown: true } : {}),
    ...(oneOf(value.watchCount, ['all', 'once', 'rewatched'] as const)
      ? { watchCount: oneOf(value.watchCount, ['all', 'once', 'rewatched'] as const) }
      : {}),
    ...(oneOf(value.overlap, ['all', 'overlap', 'not_overlap'] as const)
      ? { overlap: oneOf(value.overlap, ['all', 'overlap', 'not_overlap'] as const) }
      : {}),
    ...(format?.length ? { format } : {}),
    ...(oneOf(value.availability, ['available', 'unavailable', 'unchecked'] as const)
      ? {
          availability: oneOf(value.availability, [
            'available',
            'unavailable',
            'unchecked',
          ] as const),
        }
      : {}),
    ...(values(value.category).length ? { category: values(value.category) } : {}),
  }
}

export function videoQuerySearch(search: VideosRouteSearch) {
  const result = { ...search }
  delete result.item
  delete result.channelItem
  delete result.layout
  return result
}

export function normalizeVideoSearch(
  search: VideosRouteSearch,
  view: 'archive' | 'queue' | 'channels',
) {
  const result = { ...search }
  if (result.item && result.channelItem) delete result.channelItem
  const sorts =
    view === 'archive'
      ? ['watchedAt', 'title', 'channel', 'watchCount', 'publishedAt', 'duration', 'relevance']
      : view === 'queue'
        ? ['addedAt', 'title', 'channel', 'publishedAt', 'duration', 'relevance']
        : ['watchCount', 'channel', 'watchedAt', 'queueCount', 'relevance']
  if (result.sort && !sorts.includes(result.sort)) {
    delete result.sort
    delete result.direction
  }
  if (result.sort === 'relevance' && !result.q) {
    delete result.sort
    delete result.direction
  }
  if (view === 'channels') {
    delete result.item
    delete result.account
    delete result.channel
    delete result.watchedFrom
    delete result.watchedTo
    delete result.watchedUnknown
    delete result.addedFrom
    delete result.addedTo
    delete result.addedUnknown
    delete result.published
    delete result.publishedFrom
    delete result.publishedTo
    delete result.duration
    delete result.durationUnknown
    delete result.watchCount
    delete result.overlap
    delete result.format
    delete result.availability
    delete result.category
    delete result.layout
  } else {
    delete result.channelItem
    if (view === 'archive') {
      delete result.addedFrom
      delete result.addedTo
      delete result.addedUnknown
    } else {
      delete result.watchedFrom
      delete result.watchedTo
      delete result.watchedUnknown
      delete result.watchCount
    }
  }
  return result
}
