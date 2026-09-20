export interface BooksRouteSearch {
  q?: string | undefined
  format?: string[] | undefined
  series?: string[] | undefined
  genre?: string[] | undefined
  finishedMode?: 'range' | 'unavailable' | undefined
  finishedFrom?: string | undefined
  finishedTo?: string | undefined
  publishedMode?: 'range' | 'unavailable' | undefined
  publishedFrom?: string | undefined
  publishedTo?: string | undefined
  addedMode?: 'range' | 'unavailable' | undefined
  addedFrom?: string | undefined
  addedTo?: string | undefined
  ratingMode?: 'rated' | 'unrated' | 'minimum' | undefined
  minRating?: number | undefined
  sort?: string | undefined
  direction?: 'asc' | 'desc' | undefined
  layout?: 'grid' | 'list' | undefined
  item?: string | undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function values(value: unknown): string[] | undefined {
  const result = (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return result.length > 0 ? [...new Set(result)] : undefined
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : undefined
}

function date(value: unknown): string | undefined {
  const parsed = stringValue(value)
  return parsed && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(parsed) ? parsed : undefined
}

export function parseBooksRouteSearch(value: Record<string, unknown>): BooksRouteSearch {
  const minimum = Number(value.minRating)
  return {
    ...(stringValue(value.q) ? { q: stringValue(value.q) } : {}),
    ...(values(value.format) ? { format: values(value.format) } : {}),
    ...(values(value.series) ? { series: values(value.series) } : {}),
    ...(values(value.genre) ? { genre: values(value.genre) } : {}),
    ...(oneOf(value.finishedMode, ['range', 'unavailable'] as const)
      ? { finishedMode: oneOf(value.finishedMode, ['range', 'unavailable'] as const) }
      : {}),
    ...(date(value.finishedFrom) ? { finishedFrom: date(value.finishedFrom) } : {}),
    ...(date(value.finishedTo) ? { finishedTo: date(value.finishedTo) } : {}),
    ...(oneOf(value.publishedMode, ['range', 'unavailable'] as const)
      ? { publishedMode: oneOf(value.publishedMode, ['range', 'unavailable'] as const) }
      : {}),
    ...(date(value.publishedFrom) ? { publishedFrom: date(value.publishedFrom) } : {}),
    ...(date(value.publishedTo) ? { publishedTo: date(value.publishedTo) } : {}),
    ...(oneOf(value.addedMode, ['range', 'unavailable'] as const)
      ? { addedMode: oneOf(value.addedMode, ['range', 'unavailable'] as const) }
      : {}),
    ...(date(value.addedFrom) ? { addedFrom: date(value.addedFrom) } : {}),
    ...(date(value.addedTo) ? { addedTo: date(value.addedTo) } : {}),
    ...(oneOf(value.ratingMode, ['rated', 'unrated', 'minimum'] as const)
      ? { ratingMode: oneOf(value.ratingMode, ['rated', 'unrated', 'minimum'] as const) }
      : {}),
    ...(Number.isFinite(minimum) && minimum >= 0 && minimum <= 5 ? { minRating: minimum } : {}),
    ...(stringValue(value.sort) ? { sort: stringValue(value.sort) } : {}),
    ...(oneOf(value.direction, ['asc', 'desc'] as const)
      ? { direction: oneOf(value.direction, ['asc', 'desc'] as const) }
      : {}),
    ...(oneOf(value.layout, ['grid', 'list'] as const)
      ? { layout: oneOf(value.layout, ['grid', 'list'] as const) }
      : {}),
    ...(stringValue(value.item) ? { item: stringValue(value.item) } : {}),
  }
}

export function normalizedForCollection(
  search: BooksRouteSearch,
  collection: 'archive' | 'queue',
): BooksRouteSearch {
  if (collection === 'archive') {
    const archive = { ...search }
    delete archive.addedMode
    delete archive.addedFrom
    delete archive.addedTo
    return archive
  }
  const queue = { ...search }
  delete queue.finishedMode
  delete queue.finishedFrom
  delete queue.finishedTo
  delete queue.ratingMode
  delete queue.minRating
  return queue
}
