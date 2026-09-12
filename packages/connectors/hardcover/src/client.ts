export interface HardcoverReadThrough {
  id: number
  editionId: number | null
  finishedAt: string | null
  finishedAtPrecision: number | string | null
}

export interface HardcoverReadBook {
  userBookId: number
  bookId: number
  editionId: number | null
  statusId: number
  readCount: number
  rating: number | null
  review: string | null
  updatedAt: string | null
  title: string | null
  subtitle: string | null
  releaseDate: string | null
  releaseYear: number | null
  workCanonicalId: number | null
  editionCanonicalId: number | null
  isbn10: string | null
  isbn13: string | null
  asin: string | null
  audioSeconds: number | null
  reads: HardcoverReadThrough[]
}

export interface HardcoverPage {
  books: HardcoverReadBook[]
  bytes: Uint8Array
  contentType: string
}

interface GraphqlEnvelope {
  data?: unknown
  errors?: { message?: string }[]
}

const readBooksQuery = `
  query ReadBooks($userId: Int!, $afterId: Int!, $limit: Int!) {
    user_books(
      where: { user_id: { _eq: $userId }, status_id: { _eq: 3 }, id: { _gt: $afterId } }
      order_by: { id: asc }
      limit: $limit
    ) {
      id
      book_id
      edition_id
      status_id
      read_count
      rating
      review
      updated_at
      book {
        id
        canonical_id
        title
        subtitle
        release_date
        release_year
      }
      edition {
        id
        canonical_id
        isbn_10
        isbn_13
        asin
        audio_seconds
      }
      user_book_reads(order_by: { id: asc }) {
        id
        edition_id
        finished_at
        finished_at_precision
      }
    }
  }
`

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Hardcover ${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`Hardcover ${label} must be an integer`)
  }
  return value
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : integer(value, label)
}

function nullableNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Hardcover ${label} must be a number`)
  }
  return value
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new TypeError(`Hardcover ${label} must be a string`)
  return value
}

function nullableStringOrNumber(value: unknown, label: string): number | string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new TypeError(`Hardcover ${label} must be a string or number`)
  }
  return value
}

function parseRead(value: unknown): HardcoverReadThrough {
  const row = record(value, 'read-through')
  return {
    id: integer(row.id, 'read-through id'),
    editionId: nullableInteger(row.edition_id, 'read-through edition id'),
    finishedAt: nullableString(row.finished_at, 'finished date'),
    finishedAtPrecision: nullableStringOrNumber(
      row.finished_at_precision,
      'finished date precision',
    ),
  }
}

export function parseHardcoverReadBook(value: unknown): HardcoverReadBook {
  const row = record(value, 'user book')
  const book = record(row.book, 'book')
  const edition = row.edition === null ? null : record(row.edition, 'edition')
  if (!Array.isArray(row.user_book_reads)) {
    throw new TypeError('Hardcover user_book_reads must be an array')
  }
  return {
    userBookId: integer(row.id, 'user book id'),
    bookId: integer(row.book_id, 'book id'),
    editionId: nullableInteger(row.edition_id, 'edition id'),
    statusId: integer(row.status_id, 'status id'),
    readCount: integer(row.read_count, 'read count'),
    rating: nullableNumber(row.rating, 'rating'),
    review: nullableString(row.review, 'review'),
    updatedAt: nullableString(row.updated_at, 'updated timestamp'),
    title: nullableString(book.title, 'title'),
    subtitle: nullableString(book.subtitle, 'subtitle'),
    releaseDate: nullableString(book.release_date, 'release date'),
    releaseYear: nullableInteger(book.release_year, 'release year'),
    workCanonicalId: nullableInteger(book.canonical_id, 'canonical book id'),
    editionCanonicalId:
      edition === null ? null : nullableInteger(edition.canonical_id, 'canonical edition id'),
    isbn10: edition === null ? null : nullableString(edition.isbn_10, 'ISBN-10'),
    isbn13: edition === null ? null : nullableString(edition.isbn_13, 'ISBN-13'),
    asin: edition === null ? null : nullableString(edition.asin, 'ASIN'),
    audioSeconds: edition === null ? null : nullableInteger(edition.audio_seconds, 'audio seconds'),
    reads: row.user_book_reads.map(parseRead),
  }
}

async function graphql(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; contentType: string; envelope: GraphqlEnvelope }> {
  const response = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'MediaTracker/0.0.0 (personal-use archive sync)',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) throw new Error(`Hardcover GraphQL returned ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const envelope = JSON.parse(new TextDecoder().decode(bytes)) as GraphqlEnvelope
  if (envelope.errors !== undefined && envelope.errors.length > 0) {
    throw new Error(
      `Hardcover GraphQL error: ${envelope.errors.map((error) => error.message ?? 'unknown').join('; ')}`,
    )
  }
  if (envelope.data === undefined) throw new Error('Hardcover GraphQL returned no data')
  return {
    bytes,
    contentType: response.headers.get('content-type') ?? 'application/json',
    envelope,
  }
}

export async function fetchHardcoverUserId(token: string): Promise<number> {
  const result = await graphql(token, 'query MediaTrackerMe { me { id } }', {})
  const data = record(result.envelope.data, 'me response')
  const values = Array.isArray(data.me) ? data.me : [data.me]
  const me = record(values[0], 'me')
  return integer(me.id, 'user id')
}

export async function fetchHardcoverReadBooksPage(input: {
  token: string
  userId: number
  afterId: number
  limit?: number
}): Promise<HardcoverPage> {
  const result = await graphql(input.token, readBooksQuery, {
    userId: input.userId,
    afterId: input.afterId,
    limit: input.limit ?? 100,
  })
  const data = record(result.envelope.data, 'read books response')
  if (!Array.isArray(data.user_books)) throw new TypeError('Hardcover user_books must be an array')
  return {
    books: data.user_books.map(parseHardcoverReadBook),
    bytes: result.bytes,
    contentType: result.contentType,
  }
}
