export interface MoviesRouteSearch {
  q?: string | undefined
  view?: 'grid' | 'list' | undefined
  sort?: string | undefined
  direction?: 'asc' | 'desc' | undefined
  item?: string | undefined
  watched?: 'range' | 'unknown' | undefined
  watchedFrom?: string | undefined
  watchedTo?: string | undefined
  added?: 'range' | 'unknown' | undefined
  addedFrom?: string | undefined
  addedTo?: string | undefined
  releaseYearFrom?: string | undefined
  releaseYearTo?: string | undefined
  releaseYearUnknown?: boolean | undefined
  rating?: 'rated' | 'unrated' | 'range' | undefined
  ratingMin?: number | undefined
  ratingMax?: number | undefined
  reviewed?: 'yes' | 'no' | undefined
  archive?: 'yes' | 'no' | undefined
  runtime?: 'under90' | '90to119' | '120to149' | '150plus' | undefined
  runtimeUnknown?: boolean | undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : undefined
}

function date(value: unknown): string | undefined {
  const parsed = stringValue(value)
  return parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : undefined
}

function year(value: unknown): string | undefined {
  const parsed = stringValue(value)
  return parsed && /^\d{4}$/.test(parsed) ? parsed : undefined
}

function flag(value: unknown): boolean | undefined {
  return value === true || value === 'true' ? true : undefined
}

function rating(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) &&
    number >= 0.5 &&
    number <= 5 &&
    number * 2 === Math.round(number * 2)
    ? number
    : undefined
}

export function parseMoviesRouteSearch(value: Record<string, unknown>): MoviesRouteSearch {
  return {
    ...(stringValue(value.q) ? { q: stringValue(value.q) } : {}),
    ...(oneOf(value.view, ['grid', 'list'] as const)
      ? { view: oneOf(value.view, ['grid', 'list'] as const) }
      : {}),
    ...(stringValue(value.sort) ? { sort: stringValue(value.sort) } : {}),
    ...(oneOf(value.direction, ['asc', 'desc'] as const)
      ? { direction: oneOf(value.direction, ['asc', 'desc'] as const) }
      : {}),
    ...(stringValue(value.item) ? { item: stringValue(value.item) } : {}),
    ...(oneOf(value.watched, ['range', 'unknown'] as const)
      ? { watched: oneOf(value.watched, ['range', 'unknown'] as const) }
      : {}),
    ...(date(value.watchedFrom) ? { watchedFrom: date(value.watchedFrom) } : {}),
    ...(date(value.watchedTo) ? { watchedTo: date(value.watchedTo) } : {}),
    ...(oneOf(value.added, ['range', 'unknown'] as const)
      ? { added: oneOf(value.added, ['range', 'unknown'] as const) }
      : {}),
    ...(date(value.addedFrom) ? { addedFrom: date(value.addedFrom) } : {}),
    ...(date(value.addedTo) ? { addedTo: date(value.addedTo) } : {}),
    ...(year(value.releaseYearFrom) ? { releaseYearFrom: year(value.releaseYearFrom) } : {}),
    ...(year(value.releaseYearTo) ? { releaseYearTo: year(value.releaseYearTo) } : {}),
    ...(flag(value.releaseYearUnknown) ? { releaseYearUnknown: true } : {}),
    ...(oneOf(value.rating, ['rated', 'unrated', 'range'] as const)
      ? { rating: oneOf(value.rating, ['rated', 'unrated', 'range'] as const) }
      : {}),
    ...(rating(value.ratingMin) ? { ratingMin: rating(value.ratingMin) } : {}),
    ...(rating(value.ratingMax) ? { ratingMax: rating(value.ratingMax) } : {}),
    ...(oneOf(value.reviewed, ['yes', 'no'] as const)
      ? { reviewed: oneOf(value.reviewed, ['yes', 'no'] as const) }
      : {}),
    ...(oneOf(value.archive, ['yes', 'no'] as const)
      ? { archive: oneOf(value.archive, ['yes', 'no'] as const) }
      : {}),
    ...(oneOf(value.runtime, ['under90', '90to119', '120to149', '150plus'] as const)
      ? {
          runtime: oneOf(value.runtime, ['under90', '90to119', '120to149', '150plus'] as const),
        }
      : {}),
    ...(flag(value.runtimeUnknown) ? { runtimeUnknown: true } : {}),
  }
}

export function normalizedForMovieCollection(
  search: MoviesRouteSearch,
  collection: 'archive' | 'queue',
): MoviesRouteSearch {
  const next = { ...search }
  if (collection === 'archive') {
    delete next.added
    delete next.addedFrom
    delete next.addedTo
    delete next.archive
    if (
      next.sort !== undefined &&
      ![
        'watchedAt',
        'title',
        'releaseYear',
        'personalRating',
        'watchCount',
        'runtime',
        'relevance',
      ].includes(next.sort)
    ) {
      delete next.sort
      delete next.direction
    }
  } else {
    delete next.watched
    delete next.watchedFrom
    delete next.watchedTo
    delete next.reviewed
    if (
      next.sort !== undefined &&
      !['addedAt', 'title', 'releaseYear', 'personalRating', 'runtime', 'relevance'].includes(
        next.sort,
      )
    ) {
      delete next.sort
      delete next.direction
    }
  }
  if (next.sort === 'relevance' && !next.q) {
    delete next.sort
    delete next.direction
  }
  return next
}

export function movieCollectionQuerySearch(search: MoviesRouteSearch): MoviesRouteSearch {
  const query = { ...search }
  delete query.item
  delete query.view
  return query
}
