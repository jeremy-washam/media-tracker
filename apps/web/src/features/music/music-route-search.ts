export interface MusicRouteSearch {
  q?: string | undefined
  item?: string | undefined
  layout?: 'grid' | 'list' | undefined
  sort?: string | undefined
  direction?: 'asc' | 'desc' | undefined
  from?: string | undefined
  to?: string | undefined
  source?: 'all' | 'export' | 'recent_api' | undefined
  minPlaybacks?: number | undefined
  playbackCount?: 'any' | 'once' | '2to9' | '10to49' | '50plus' | undefined
  metadata?: 'any' | 'current' | 'export_only' | 'unavailable' | undefined
  artist?: string[] | undefined
  album?: string[] | undefined
  explicit?: 'any' | 'yes' | 'no' | 'unknown' | undefined
  albumType?: 'any' | 'album' | 'single' | 'compilation' | 'other' | 'unknown' | undefined
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

export function parseMusicRouteSearch(value: Record<string, unknown>): MusicRouteSearch {
  const min = Number(value.minPlaybacks)
  return {
    ...(string(value.q) ? { q: string(value.q) } : {}),
    ...(string(value.item) ? { item: string(value.item) } : {}),
    ...(oneOf(value.layout, ['grid', 'list'] as const)
      ? { layout: oneOf(value.layout, ['grid', 'list'] as const) }
      : {}),
    ...(string(value.sort) ? { sort: string(value.sort) } : {}),
    ...(oneOf(value.direction, ['asc', 'desc'] as const)
      ? { direction: oneOf(value.direction, ['asc', 'desc'] as const) }
      : {}),
    ...(string(value.from) ? { from: string(value.from) } : {}),
    ...(string(value.to) ? { to: string(value.to) } : {}),
    ...(oneOf(value.source, ['all', 'export', 'recent_api'] as const)
      ? { source: oneOf(value.source, ['all', 'export', 'recent_api'] as const) }
      : {}),
    ...(Number.isInteger(min) && min > 0 ? { minPlaybacks: min } : {}),
    ...(oneOf(value.playbackCount, ['any', 'once', '2to9', '10to49', '50plus'] as const)
      ? {
          playbackCount: oneOf(value.playbackCount, [
            'any',
            'once',
            '2to9',
            '10to49',
            '50plus',
          ] as const),
        }
      : {}),
    ...(oneOf(value.metadata, ['any', 'current', 'export_only', 'unavailable'] as const)
      ? {
          metadata: oneOf(value.metadata, [
            'any',
            'current',
            'export_only',
            'unavailable',
          ] as const),
        }
      : {}),
    ...(values(value.artist).length ? { artist: values(value.artist) } : {}),
    ...(values(value.album).length ? { album: values(value.album) } : {}),
    ...(oneOf(value.explicit, ['any', 'yes', 'no', 'unknown'] as const)
      ? { explicit: oneOf(value.explicit, ['any', 'yes', 'no', 'unknown'] as const) }
      : {}),
    ...(oneOf(value.albumType, [
      'any',
      'album',
      'single',
      'compilation',
      'other',
      'unknown',
    ] as const)
      ? {
          albumType: oneOf(value.albumType, [
            'any',
            'album',
            'single',
            'compilation',
            'other',
            'unknown',
          ] as const),
        }
      : {}),
  }
}

export function musicQuerySearch(search: MusicRouteSearch) {
  const result = { ...search }
  delete result.item
  delete result.layout
  return result
}

export function normalizeMusicSearch(
  search: MusicRouteSearch,
  view: 'tracks' | 'albums' | 'artists',
) {
  const result = { ...search }
  const supported =
    view === 'tracks'
      ? ['playedAt', 'title', 'artist', 'album', 'playbackCount', 'observedTime', 'relevance']
      : view === 'albums'
        ? [
            'playedAt',
            'title',
            'artist',
            'playbackCount',
            'observedTime',
            'trackCount',
            'releasedAt',
            'relevance',
          ]
        : [
            'playedAt',
            'title',
            'playbackCount',
            'observedTime',
            'trackCount',
            'releaseCount',
            'relevance',
          ]
  if (result.sort && !supported.includes(result.sort)) {
    delete result.sort
    delete result.direction
  }
  if (result.sort === 'relevance' && !result.q) {
    delete result.sort
    delete result.direction
  }
  if (view !== 'tracks') {
    delete result.album
    delete result.explicit
  }
  if (view === 'artists') delete result.artist
  if (view !== 'albums') delete result.albumType
  return result
}
