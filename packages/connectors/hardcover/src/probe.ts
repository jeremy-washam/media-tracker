interface GraphqlEnvelope<T> {
  data?: T
  errors?: { message?: string }[]
}

interface MeData {
  me?: { id?: number } | { id?: number }[]
}

interface UserBooksData {
  user_books_aggregate?: { aggregate?: { count?: number } | null }
  user_books?: Record<string, unknown>[]
}

const token = process.env.HARDCOVER_TOKEN

if (token === undefined || token.length === 0) {
  console.error(
    'HARDCOVER_TOKEN is not set. Copy .env.example to .env.local, add the token there, and rerun this command.',
  )
  process.exitCode = 1
} else {
  async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch('https://api.hardcover.app/v1/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'MediaTracker/0.0.0 (personal-use schema probe)',
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok) throw new Error(`Hardcover GraphQL returned ${response.status}`)
    const envelope = (await response.json()) as GraphqlEnvelope<T>
    if (envelope.errors !== undefined && envelope.errors.length > 0) {
      throw new Error(
        `Hardcover GraphQL errors: ${envelope.errors.map((error) => error.message ?? 'unknown').join('; ')}`,
      )
    }
    if (envelope.data === undefined) throw new Error('Hardcover GraphQL returned no data')
    return envelope.data
  }

  function summarizeShape(value: unknown) {
    const stats = new Map<
      string,
      { path: string; types: Set<string>; observations: number; nulls: number }
    >()

    function observe(path: string, type: string): void {
      const stat = stats.get(path) ?? {
        path,
        types: new Set<string>(),
        observations: 0,
        nulls: 0,
      }
      stat.types.add(type)
      stat.observations += 1
      if (type === 'null') stat.nulls += 1
      stats.set(path, stat)
    }

    function walk(current: unknown, path: string): void {
      if (current === null) {
        observe(path, 'null')
      } else if (Array.isArray(current)) {
        observe(path, 'array')
        for (const item of current) walk(item, `${path}[]`)
      } else if (typeof current === 'object') {
        observe(path, 'object')
        for (const [key, child] of Object.entries(current)) {
          walk(child, path.length === 0 ? key : `${path}.${key}`)
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

  function numericCounts(values: unknown[]): Record<string, number> {
    const result: Record<string, number> = {}
    for (const value of values) {
      if (typeof value !== 'number') continue
      const key = String(value)
      result[key] = (result[key] ?? 0) + 1
    }
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => Number(a) - Number(b)))
  }

  function stringRange(values: unknown[]): { earliest: string | null; latest: string | null } {
    const strings = values.filter((value): value is string => typeof value === 'string').sort()
    return { earliest: strings[0] ?? null, latest: strings.at(-1) ?? null }
  }

  const meData = await graphql<MeData>('query ProbeMe { me { id } }')
  const me = Array.isArray(meData.me) ? meData.me[0] : meData.me
  if (me?.id === undefined) throw new Error('Hardcover me query did not return a user ID')

  const rows: Record<string, unknown>[] = []
  let totalReported: number | null = null
  const pageSize = 100

  for (let offset = 0; ; offset += pageSize) {
    const page = await graphql<UserBooksData>(
      `
        query ProbeUserBooks($userId: Int!, $limit: Int!, $offset: Int!) {
          user_books_aggregate(where: { user_id: { _eq: $userId } }) {
            aggregate {
              count
            }
          }
          user_books(
            where: { user_id: { _eq: $userId } }
            order_by: { id: asc }
            limit: $limit
            offset: $offset
          ) {
            id
            user_id
            book_id
            edition_id
            original_book_id
            original_edition_id
            status_id
            read_count
            date_added
            created_at
            updated_at
            first_read_date
            last_read_date
            first_started_reading_date
            reviewed_at
            rating
            has_review
            review
            review_raw
            review_has_spoilers
            private_notes
            starred
            imported
            merged_at
            book {
              id
              canonical_id
              title
              subtitle
              release_date
              release_year
              pages
              audio_seconds
              updated_at
            }
            edition {
              id
              canonical_id
              book_id
              isbn_10
              isbn_13
              asin
              pages
              audio_seconds
              reading_format_id
              edition_format
              release_date
              release_year
              updated_at
            }
            user_book_reads(order_by: { id: asc }) {
              id
              user_book_id
              edition_id
              started_at
              paused_at
              finished_at
              finished_at_precision
              progress
              progress_pages
              progress_seconds
            }
          }
        }
      `,
      { userId: me.id, limit: pageSize, offset },
    )

    totalReported ??= page.user_books_aggregate?.aggregate?.count ?? null
    const pageRows = page.user_books ?? []
    rows.push(...pageRows)
    if (pageRows.length < pageSize) break
  }

  const reads = rows.flatMap((row) =>
    Array.isArray(row.user_book_reads) ? row.user_book_reads : [],
  )
  const finishedReads = reads.filter(
    (read): read is Record<string, unknown> =>
      typeof read === 'object' && read !== null && typeof read.finished_at === 'string',
  )
  const readStatusRows = rows.filter((row) => row.status_id === 3)
  const declaredReadOccurrences = rows.reduce(
    (sum, row) => sum + (typeof row.read_count === 'number' ? row.read_count : 0),
    0,
  )

  console.log(
    JSON.stringify(
      {
        authValid: true,
        totalReported,
        rowsReturned: rows.length,
        statusCounts: numericCounts(rows.map((row) => row.status_id)),
        readCountValues: numericCounts(rows.map((row) => row.read_count)),
        importedRows: rows.filter((row) => row.imported === true).length,
        ratedRows: rows.filter((row) => typeof row.rating === 'number').length,
        reviewedRows: rows.filter((row) => row.has_review === true).length,
        readStatusRows: readStatusRows.length,
        readStatusRowsWithoutFinishedRead: readStatusRows.filter(
          (row) =>
            !Array.isArray(row.user_book_reads) ||
            !row.user_book_reads.some(
              (read) =>
                typeof read === 'object' && read !== null && typeof read.finished_at === 'string',
            ),
        ).length,
        rowsWithMultipleReads: rows.filter(
          (row) => Array.isArray(row.user_book_reads) && row.user_book_reads.length > 1,
        ).length,
        declaredReadOccurrences,
        rowsWhereReadCountExceedsFinishedRows: rows.filter((row) => {
          if (typeof row.read_count !== 'number') return false
          const finished = Array.isArray(row.user_book_reads)
            ? row.user_book_reads.filter(
                (read) =>
                  typeof read === 'object' && read !== null && typeof read.finished_at === 'string',
              ).length
            : 0
          return row.read_count > finished
        }).length,
        readThroughRows: reads.length,
        finishedReadRows: finishedReads.length,
        finishedAtRange: stringRange(finishedReads.map((read) => read.finished_at)),
        lastReadDateRange: stringRange(rows.map((row) => row.last_read_date)),
        readRowsWithoutFinishedAt: reads.filter(
          (read) => typeof read === 'object' && read !== null && read.finished_at == null,
        ).length,
        shape: summarizeShape({ user_books: rows }),
      },
      null,
      2,
    ),
  )
}
