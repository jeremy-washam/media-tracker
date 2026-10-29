const presentation = new Set(['layout', 'item', 'channelItem', 'kind', 'sort', 'direction'])

export function hasCollectionFilters(search: object): boolean {
  return Object.entries(search).some(
    ([key, value]) =>
      !presentation.has(key) &&
      value !== undefined &&
      value !== '' &&
      value !== false &&
      value !== 'all' &&
      value !== 'any' &&
      (!Array.isArray(value) || value.length > 0),
  )
}

/** Clear predicates and selection while preserving presentation and a compatible sort. */
export function clearedCollectionSearch<
  T extends { sort?: string | undefined; direction?: string | undefined },
>(search: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(search).map(([key, value]) => [
      key,
      key === 'layout' || ((key === 'sort' || key === 'direction') && search.sort !== 'relevance')
        ? value
        : undefined,
    ]),
  ) as Partial<T>
}
