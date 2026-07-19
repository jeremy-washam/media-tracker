interface GraphqlEnvelope<T> {
  data?: T
  errors?: { message?: string }[]
}

interface MeData {
  me?: { id?: number } | { id?: number }[]
}

interface UserBooksData {
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

  const meData = await graphql<MeData>('query ProbeMe { me { id } }')
  const me = Array.isArray(meData.me) ? meData.me[0] : meData.me
  if (me?.id === undefined) throw new Error('Hardcover me query did not return a user ID')

  const userBooksData = await graphql<UserBooksData>(
    `
      query ProbeUserBooks($userId: Int!) {
        user_books(where: { user_id: { _eq: $userId } }, order_by: { id: asc }, limit: 25) {
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
    { userId: me.id },
  )

  const rows = userBooksData.user_books ?? []
  const reads = rows.flatMap((row) =>
    Array.isArray(row.user_book_reads) ? row.user_book_reads : [],
  )

  console.log(
    JSON.stringify(
      {
        authValid: true,
        rowsReturned: rows.length,
        statusCounts: numericCounts(rows.map((row) => row.status_id)),
        readCountValues: numericCounts(rows.map((row) => row.read_count)),
        readThroughRows: reads.length,
        readRowsWithoutFinishedAt: reads.filter(
          (read) => typeof read === 'object' && read !== null && read.finished_at == null,
        ).length,
        shape: summarizeShape(userBooksData),
      },
      null,
      2,
    ),
  )
}
