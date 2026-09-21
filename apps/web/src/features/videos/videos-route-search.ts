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
  addedFrom?: string | undefined
  addedTo?: string | undefined
  watchCount?: 'all' | 'once' | 'rewatched' | undefined
  overlap?: 'all' | 'overlap' | 'not_overlap' | undefined
  format?:
    | Array<'live' | 'upcoming' | 'recorded_live' | 'youtube_music' | 'shorts' | 'premiere'>
    | undefined
  availability?: string[] | undefined
  following?: 'all' | 'following' | undefined
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
    ...(string(value.addedFrom) ? { addedFrom: string(value.addedFrom) } : {}),
    ...(string(value.addedTo) ? { addedTo: string(value.addedTo) } : {}),
    ...(oneOf(value.watchCount, ['all', 'once', 'rewatched'] as const)
      ? { watchCount: oneOf(value.watchCount, ['all', 'once', 'rewatched'] as const) }
      : {}),
    ...(oneOf(value.overlap, ['all', 'overlap', 'not_overlap'] as const)
      ? { overlap: oneOf(value.overlap, ['all', 'overlap', 'not_overlap'] as const) }
      : {}),
    ...(format?.length ? { format } : {}),
    ...(values(value.availability).length ? { availability: values(value.availability) } : {}),
    ...(oneOf(value.following, ['all', 'following'] as const)
      ? { following: oneOf(value.following, ['all', 'following'] as const) }
      : {}),
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
    delete result.addedFrom
    delete result.addedTo
    delete result.watchCount
    delete result.overlap
    delete result.format
    delete result.availability
    delete result.layout
  } else {
    delete result.channelItem
    delete result.following
    if (view === 'archive') {
      delete result.addedFrom
      delete result.addedTo
    } else {
      delete result.watchedFrom
      delete result.watchedTo
      delete result.watchCount
    }
  }
  return result
}
