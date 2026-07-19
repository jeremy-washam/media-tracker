interface FieldStats {
  path: string
  types: Set<string>
  observations: number
  nulls: number
  arrayLengthMin?: number
  arrayLengthMax?: number
}

interface ReaderEnvelope {
  count?: number
  nextPageCursor?: string | null
  results?: unknown[]
}

const token = process.env.READWISE_TOKEN

if (token === undefined || token.length === 0) {
  console.error(
    'READWISE_TOKEN is not set. Copy .env.example to .env.local, add the token there, and rerun this command.',
  )
  process.exitCode = 1
} else {
  const headers = { Authorization: `Token ${token}` }

  async function getJson(url: URL): Promise<unknown> {
    const response = await fetch(url, { headers })
    if (!response.ok) throw new Error(`Readwise ${url.pathname} returned ${response.status}`)
    return response.json()
  }

  async function validateToken(): Promise<void> {
    const response = await fetch('https://readwise.io/api/v2/auth/', { headers })
    if (response.status !== 204)
      throw new Error(`Readwise auth validation returned ${response.status}`)
  }

  function summarizeShape(value: unknown) {
    const stats = new Map<string, FieldStats>()

    function observe(path: string, type: string): FieldStats {
      const current = stats.get(path) ?? {
        path,
        types: new Set<string>(),
        observations: 0,
        nulls: 0,
      }
      current.types.add(type)
      current.observations += 1
      if (type === 'null') current.nulls += 1
      stats.set(path, current)
      return current
    }

    function walk(current: unknown, path: string): void {
      if (current === null) {
        observe(path, 'null')
      } else if (Array.isArray(current)) {
        const stat = observe(path, 'array')
        stat.arrayLengthMin = Math.min(stat.arrayLengthMin ?? current.length, current.length)
        stat.arrayLengthMax = Math.max(stat.arrayLengthMax ?? current.length, current.length)
        for (const item of current) walk(item, `${path}[]`)
      } else if (typeof current === 'object') {
        observe(path, 'object')
        for (const [key, child] of Object.entries(current)) {
          const safeKey = path.endsWith('.tags') ? '*' : key
          walk(child, path.length === 0 ? safeKey : `${path}.${safeKey}`)
        }
      } else {
        observe(path, typeof current)
      }
    }

    walk(value, '$')
    return [...stats.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((stat) => ({ ...stat, types: [...stat.types].sort() }))
  }

  function counts(values: unknown[]): Record<string, number> {
    const result: Record<string, number> = {}
    for (const value of values) {
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
        continue
      const key = String(value)
      result[key] = (result[key] ?? 0) + 1
    }
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
  }

  function objectRows(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
    )
  }

  function stringRange(values: unknown[]): { earliest: string | null; latest: string | null } {
    const strings = values.filter((value): value is string => typeof value === 'string').sort()
    return { earliest: strings[0] ?? null, latest: strings.at(-1) ?? null }
  }

  function stringLengthRange(values: unknown[]): {
    minimum: number | null
    maximum: number | null
  } {
    const lengths = values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.length)
    return {
      minimum: lengths.length === 0 ? null : Math.min(...lengths),
      maximum: lengths.length === 0 ? null : Math.max(...lengths),
    }
  }

  async function readerSample(label: string, filters: Record<string, string>, limit = 100) {
    const url = new URL('https://readwise.io/api/v3/list/')
    url.searchParams.set('limit', String(limit))
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value)
    const payload = (await getJson(url)) as ReaderEnvelope
    const rows = objectRows(payload.results)
    return {
      label,
      totalReported: payload.count ?? null,
      rowsReturned: rows.length,
      hasNextPage: payload.nextPageCursor !== null && payload.nextPageCursor !== undefined,
      categories: counts(rows.map((row) => row.category)),
      locations: counts(rows.map((row) => row.location)),
      lastMovedAtRange: stringRange(rows.map((row) => row.last_moved_at)),
      firstOpenedAtMissing: rows.filter((row) => row.first_opened_at == null).length,
      lastMovedEqualsUpdated: rows.filter(
        (row) => row.last_moved_at !== undefined && row.last_moved_at === row.updated_at,
      ).length,
      contentAvailable: rows.filter((row) => typeof row.content === 'string').length,
      contentLength: stringLengthRange(rows.map((row) => row.content)),
      htmlContentAvailable: rows.filter((row) => typeof row.html_content === 'string').length,
      htmlContentLength: stringLengthRange(rows.map((row) => row.html_content)),
      shape: summarizeShape(payload),
    }
  }

  await validateToken()
  const reader = []
  reader.push(await readerSample('unfiltered', {}))
  reader.push(await readerSample('archive', { location: 'archive' }))
  reader.push(await readerSample('later', { location: 'later' }))
  reader.push(
    await readerSample('archiveWithHtml', { location: 'archive', withHtmlContent: 'true' }, 10),
  )

  const exportUrl = new URL('https://readwise.io/api/v2/export/')
  exportUrl.searchParams.set('page_size', '25')
  exportUrl.searchParams.set('includeDeleted', 'true')
  const highlightExport = (await getJson(exportUrl)) as ReaderEnvelope
  const highlightContainers = objectRows(highlightExport.results)
  const highlights = highlightContainers.flatMap((row) => objectRows(row.highlights))

  console.log(
    JSON.stringify(
      {
        authValid: true,
        reader,
        highlightExport: {
          totalReported: highlightExport.count ?? null,
          rowsReturned: highlightContainers.length,
          highlightsReturned: highlights.length,
          deletedContainers: highlightContainers.filter((row) => row.is_deleted === true).length,
          deletedHighlights: highlights.filter((row) => row.is_deleted === true).length,
          readerJoinCandidates: highlightContainers.filter(
            (row) => row.source === 'reader' && typeof row.external_id === 'string',
          ).length,
          hasNextPage:
            highlightExport.nextPageCursor !== null && highlightExport.nextPageCursor !== undefined,
          shape: summarizeShape(highlightExport),
        },
      },
      null,
      2,
    ),
  )
}
