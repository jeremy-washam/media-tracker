export interface ArticlesRouteSearch {
  q?: string | undefined
  density?: 'restrained' | 'expanded' | undefined
  item?: string | undefined
  sort?: string | undefined
  direction?: 'asc' | 'desc' | undefined
  type?: Array<'article' | 'newsletter' | 'pdf' | 'rss'> | undefined
  author?: string[] | undefined
  publication?: string[] | undefined
  publishedFrom?: string | undefined
  publishedTo?: string | undefined
  publishedUnknown?: boolean | undefined
  readingTime?: Array<'under5' | '5to15' | '16to30' | '31to60' | 'over60' | 'unknown'> | undefined
  progress?: Array<'notOpened' | 'openedZero' | 'inProgress' | 'complete' | 'unknown'> | undefined
  archivedFrom?: string | undefined
  archivedTo?: string | undefined
  archivedUnknown?: boolean | undefined
  currentState?: Array<'archive' | 'inbox' | 'later' | 'shortlist' | 'feed' | 'unknown'> | undefined
  queueState?: Array<'inbox' | 'later' | 'shortlist'> | undefined
  addedFrom?: string | undefined
  addedTo?: string | undefined
  addedUnknown?: boolean | undefined
  arrivedFrom?: string | undefined
  arrivedTo?: string | undefined
  arrivedUnknown?: boolean | undefined
  opened?: Array<'opened' | 'notOpened'> | undefined
  history?: Array<'archived' | 'notArchived'> | undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : undefined
}
function values(value: unknown): string[] | undefined {
  const result = (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return result.length > 0 ? [...new Set(result)] : undefined
}
function enumValues<T extends string>(value: unknown, options: readonly T[]): T[] | undefined {
  const result = values(value)?.filter((item): item is T => options.includes(item as T))
  return result && result.length > 0 ? result : undefined
}
function date(value: unknown): string | undefined {
  const parsed = stringValue(value)
  return parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : undefined
}
function flag(value: unknown): true | undefined {
  return value === true || value === 'true' || value === '1' ? true : undefined
}

export function parseArticlesRouteSearch(value: Record<string, unknown>): ArticlesRouteSearch {
  const result: ArticlesRouteSearch = {}
  const assign = <K extends keyof ArticlesRouteSearch>(key: K, parsed: ArticlesRouteSearch[K]) => {
    if (parsed !== undefined) result[key] = parsed
  }
  assign('q', stringValue(value.q))
  assign('item', stringValue(value.item))
  assign('sort', stringValue(value.sort))
  assign('density', oneOf(value.density, ['restrained', 'expanded']))
  assign('direction', oneOf(value.direction, ['asc', 'desc']))
  assign('type', enumValues(value.type, ['article', 'newsletter', 'pdf', 'rss']))
  assign('author', values(value.author))
  assign('publication', values(value.publication))
  assign('publishedFrom', date(value.publishedFrom))
  assign('publishedTo', date(value.publishedTo))
  assign('publishedUnknown', flag(value.publishedUnknown))
  assign(
    'readingTime',
    enumValues(value.readingTime, ['under5', '5to15', '16to30', '31to60', 'over60', 'unknown']),
  )
  assign(
    'progress',
    enumValues(value.progress, ['notOpened', 'openedZero', 'inProgress', 'complete', 'unknown']),
  )
  assign('archivedFrom', date(value.archivedFrom))
  assign('archivedTo', date(value.archivedTo))
  assign('archivedUnknown', flag(value.archivedUnknown))
  assign(
    'currentState',
    enumValues(value.currentState, ['archive', 'inbox', 'later', 'shortlist', 'feed', 'unknown']),
  )
  assign('queueState', enumValues(value.queueState, ['inbox', 'later', 'shortlist']))
  assign('addedFrom', date(value.addedFrom))
  assign('addedTo', date(value.addedTo))
  assign('addedUnknown', flag(value.addedUnknown))
  assign('arrivedFrom', date(value.arrivedFrom))
  assign('arrivedTo', date(value.arrivedTo))
  assign('arrivedUnknown', flag(value.arrivedUnknown))
  assign('opened', enumValues(value.opened, ['opened', 'notOpened']))
  assign('history', enumValues(value.history, ['archived', 'notArchived']))
  return result
}

const sharedSorts = ['publishedAt', 'title', 'author', 'publication', 'readingTime', 'relevance']
export function normalizedForArticleSection(
  search: ArticlesRouteSearch,
  section: 'archive' | 'queue' | 'feed',
): ArticlesRouteSearch {
  const next = { ...search }
  const remove = (...keys: (keyof ArticlesRouteSearch)[]) => {
    for (const key of keys) delete next[key]
  }
  if (section === 'archive')
    remove(
      'queueState',
      'addedFrom',
      'addedTo',
      'addedUnknown',
      'arrivedFrom',
      'arrivedTo',
      'arrivedUnknown',
      'opened',
      'history',
    )
  if (section === 'queue')
    remove(
      'archivedFrom',
      'archivedTo',
      'archivedUnknown',
      'currentState',
      'arrivedFrom',
      'arrivedTo',
      'arrivedUnknown',
      'opened',
      'history',
    )
  if (section === 'feed')
    remove(
      'archivedFrom',
      'archivedTo',
      'archivedUnknown',
      'currentState',
      'queueState',
      'addedFrom',
      'addedTo',
      'addedUnknown',
    )
  const sectionSorts =
    section === 'archive'
      ? ['archivedAt', 'addedAt']
      : section === 'queue'
        ? ['addedAt', 'queueState']
        : ['arrivedAt']
  if (next.sort && ![...sharedSorts, ...sectionSorts].includes(next.sort))
    remove('sort', 'direction')
  if (next.sort === 'relevance' && !next.q) remove('sort', 'direction')
  if (!next.sort) delete next.direction
  return next
}

export function articleCollectionQuerySearch(search: ArticlesRouteSearch): ArticlesRouteSearch {
  const next = { ...search }
  delete next.item
  delete next.density
  return next
}
