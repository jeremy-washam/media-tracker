export interface HardcoverImage {
  url: string | null
  color: string | null
}

export interface HardcoverContributor {
  id: number
  name: string
  slug: string | null
  roleId: number | null
  roleName: string
  contribution: string | null
  primary: boolean
}

export interface HardcoverSeries {
  id: number
  name: string
  slug: string | null
  booksCount: number | null
  position: number | null
  compilation: boolean
  featured: boolean
}

export interface HardcoverTaxonomyTerm {
  category: string
  value: string
  slug: string
}

export interface HardcoverEdition {
  id: number
  bookId: number
  canonicalId: number | null
  title: string | null
  subtitle: string | null
  information: string | null
  readingFormatId: number | null
  readingFormat: string | null
  rawFormat: string | null
  pages: number | null
  audioSeconds: number | null
  releaseDate: string | null
  publisher: string | null
  language: string | null
  isbn10: string | null
  isbn13: string | null
  asin: string | null
  image: HardcoverImage
  contributors: HardcoverContributor[]
}

export interface HardcoverReadThrough {
  id: number
  editionId: number | null
  startedAt: string | null
  pausedAt: string | null
  finishedAt: string | null
  finishedAtPrecision: number | string | null
  progress: number | null
  progressPages: number | null
  progressSeconds: number | null
}

export interface HardcoverReadBook {
  userBookId: number
  bookId: number
  editionId: number | null
  statusId: number
  statusLabel: string | null
  dateAdded: string | null
  readCount: number
  rating: number | null
  review: string | null
  reviewHasSpoilers: boolean
  reviewedAt: string | null
  updatedAt: string | null
  title: string | null
  subtitle: string | null
  description: string | null
  slug: string | null
  pages: number | null
  releaseDate: string | null
  releaseYear: number | null
  workCanonicalId: number | null
  cover: HardcoverImage
  communityRating: number | null
  communityRatingsCount: number
  usersReadCount: number
  defaultCoverEditionId: number | null
  editionCanonicalId: number | null
  isbn10: string | null
  isbn13: string | null
  asin: string | null
  audioSeconds: number | null
  currentEdition: HardcoverEdition | null
  defaultCoverEdition: HardcoverEdition | null
  contributors: HardcoverContributor[]
  series: HardcoverSeries[]
  taxonomy: HardcoverTaxonomyTerm[]
  reads: HardcoverReadThrough[]
}

export interface HardcoverPage {
  books: HardcoverReadBook[]
  bytes: Uint8Array
  contentType: string
}

export interface HardcoverEditionsPage {
  editions: HardcoverEdition[]
  bytes: Uint8Array
  contentType: string
}

interface GraphqlEnvelope {
  data?: unknown
  errors?: { message?: string }[]
}

const libraryBooksQuery = `
  query LibraryBooks($userId: Int!, $afterId: Int!, $limit: Int!) {
    user_books(
      where: { user_id: { _eq: $userId }, status_id: { _in: [1, 2, 3] }, id: { _gt: $afterId } }
      order_by: { id: asc }
      limit: $limit
    ) {
      id
      book_id
      edition_id
      status_id
      date_added
      read_count
      rating
      review
      review_has_spoilers
      reviewed_at
      updated_at
      user_book_status { status }
      book {
        id
        canonical_id
        title
        subtitle
        description
        slug
        pages
        audio_seconds
        release_date
        release_year
        cached_image
        cached_tags
        rating
        ratings_count
        users_read_count
        default_cover_edition_id
        contributions(order_by: { id: asc }) {
          contribution
          author { id name slug }
          contributor_role { id name primary }
        }
        book_series(order_by: { id: asc }) {
          position
          compilation
          featured
          series { id name slug books_count }
        }
        default_cover_edition {
          id book_id canonical_id title subtitle edition_information edition_format
          reading_format_id pages audio_seconds release_date isbn_10 isbn_13 asin cached_image
          reading_format { id format }
          publisher { name }
          language { language }
          contributions(order_by: { id: asc }) {
            contribution
            author { id name slug }
            contributor_role { id name primary }
          }
        }
      }
      edition {
        id book_id canonical_id title subtitle edition_information edition_format
        reading_format_id pages audio_seconds release_date isbn_10 isbn_13 asin cached_image
        reading_format { id format }
        publisher { name }
        language { language }
        contributions(order_by: { id: asc }) {
          contribution
          author { id name slug }
          contributor_role { id name primary }
        }
      }
      user_book_reads(order_by: { id: asc }) {
        id
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
`

const editionsQuery = `
  query LibraryEditions($ids: [Int!]!) {
    editions(where: { id: { _in: $ids } }, order_by: { id: asc }) {
      id book_id canonical_id title subtitle edition_information edition_format
      reading_format_id pages audio_seconds release_date isbn_10 isbn_13 asin cached_image
      reading_format { id format }
      publisher { name }
      language { language }
      contributions(order_by: { id: asc }) {
        contribution
        author { id name slug }
        contributor_role { id name primary }
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

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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

function nonnegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
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

function booleanOr(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseImage(value: unknown): HardcoverImage {
  const image = optionalRecord(value)
  return {
    url: image === null ? null : nullableString(image.url, 'image URL'),
    color: image === null ? null : nullableString(image.color, 'image color'),
  }
}

function parseContributor(value: unknown): HardcoverContributor | null {
  const contribution = optionalRecord(value)
  const author = optionalRecord(contribution?.author)
  if (contribution === null || author === null) return null
  const role = optionalRecord(contribution.contributor_role)
  return {
    id: integer(author.id, 'contributor id'),
    name: nullableString(author.name, 'contributor name') ?? 'Unknown contributor',
    slug: nullableString(author.slug, 'contributor slug'),
    roleId: role === null ? null : nullableInteger(role.id, 'contributor role id'),
    roleName:
      (role === null ? null : nullableString(role.name, 'contributor role name')) ?? 'Author',
    contribution: nullableString(contribution.contribution, 'contribution'),
    primary: role === null ? true : booleanOr(role.primary, false),
  }
}

function parseContributors(value: unknown): HardcoverContributor[] {
  return arrayOrEmpty(value).flatMap((entry) => {
    const contributor = parseContributor(entry)
    return contributor === null ? [] : [contributor]
  })
}

function parseEdition(value: unknown, fallbackBookId?: number): HardcoverEdition | null {
  const row = optionalRecord(value)
  if (row === null) return null
  const readingFormat = optionalRecord(row.reading_format)
  const publisher = optionalRecord(row.publisher)
  const language = optionalRecord(row.language)
  return {
    id: integer(row.id, 'edition id'),
    bookId: nullableInteger(row.book_id, 'edition book id') ?? fallbackBookId ?? 0,
    canonicalId: nullableInteger(row.canonical_id, 'canonical edition id'),
    title: nullableString(row.title, 'edition title'),
    subtitle: nullableString(row.subtitle, 'edition subtitle'),
    information: nullableString(row.edition_information, 'edition information'),
    readingFormatId:
      nullableInteger(row.reading_format_id, 'reading format id') ??
      (readingFormat === null ? null : nullableInteger(readingFormat.id, 'reading format id')),
    readingFormat:
      readingFormat === null ? null : nullableString(readingFormat.format, 'reading format'),
    rawFormat: nullableString(row.edition_format, 'raw edition format'),
    pages: nullableInteger(row.pages, 'edition pages'),
    audioSeconds: nullableInteger(row.audio_seconds, 'edition audio seconds'),
    releaseDate: nullableString(row.release_date, 'edition release date'),
    publisher: publisher === null ? null : nullableString(publisher.name, 'publisher name'),
    language: language === null ? null : nullableString(language.language, 'language'),
    isbn10: nullableString(row.isbn_10, 'ISBN-10'),
    isbn13: nullableString(row.isbn_13, 'ISBN-13'),
    asin: nullableString(row.asin, 'ASIN'),
    image: parseImage(row.cached_image),
    contributors: parseContributors(row.contributions),
  }
}

function parseRead(value: unknown): HardcoverReadThrough {
  const row = record(value, 'read-through')
  return {
    id: integer(row.id, 'read-through id'),
    editionId: nullableInteger(row.edition_id, 'read-through edition id'),
    startedAt: nullableString(row.started_at, 'started date'),
    pausedAt: nullableString(row.paused_at, 'paused date'),
    finishedAt: nullableString(row.finished_at, 'finished date'),
    finishedAtPrecision: nullableStringOrNumber(
      row.finished_at_precision,
      'finished date precision',
    ),
    progress: nullableNumber(row.progress, 'progress'),
    progressPages: nullableInteger(row.progress_pages, 'progress pages'),
    progressSeconds: nullableInteger(row.progress_seconds, 'progress seconds'),
  }
}

function parseSeries(value: unknown): HardcoverSeries | null {
  const link = optionalRecord(value)
  const series = optionalRecord(link?.series)
  if (link === null || series === null) return null
  return {
    id: integer(series.id, 'series id'),
    name: nullableString(series.name, 'series name') ?? 'Untitled series',
    slug: nullableString(series.slug, 'series slug'),
    booksCount: nullableInteger(series.books_count, 'series books count'),
    position: nullableNumber(link.position, 'series position'),
    compilation: booleanOr(link.compilation),
    featured: booleanOr(link.featured),
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseTaxonomy(value: unknown): HardcoverTaxonomyTerm[] {
  const cached = optionalRecord(value)
  if (cached === null) return []
  const terms: HardcoverTaxonomyTerm[] = []
  for (const [fallbackCategory, entries] of Object.entries(cached)) {
    for (const entry of arrayOrEmpty(entries)) {
      const term = optionalRecord(entry)
      if (term === null) continue
      const category = nullableString(term.category, 'tag category') ?? fallbackCategory
      const label = nullableString(term.tag, 'tag name')
      if (label === null || label.trim() === '') continue
      terms.push({
        category,
        value: label.trim(),
        slug: nullableString(term.tagSlug, 'tag slug') ?? slugify(label),
      })
    }
  }
  return terms
}

export function parseHardcoverReadBook(value: unknown): HardcoverReadBook {
  const row = record(value, 'user book')
  const book = record(row.book, 'book')
  if (!Array.isArray(row.user_book_reads)) {
    throw new TypeError('Hardcover user_book_reads must be an array')
  }
  const bookId = integer(row.book_id, 'book id')
  const currentEdition = parseEdition(row.edition, bookId)
  const defaultCoverEdition = parseEdition(book.default_cover_edition, bookId)
  const status = optionalRecord(row.user_book_status)
  const workImage = parseImage(book.cached_image)
  return {
    userBookId: integer(row.id, 'user book id'),
    bookId,
    editionId: nullableInteger(row.edition_id, 'edition id'),
    statusId: integer(row.status_id, 'status id'),
    statusLabel: status === null ? null : nullableString(status.status, 'status label'),
    dateAdded: nullableString(row.date_added, 'date added'),
    readCount: integer(row.read_count, 'read count'),
    rating: nullableNumber(row.rating, 'rating'),
    review: nullableString(row.review, 'review'),
    reviewHasSpoilers: booleanOr(row.review_has_spoilers),
    reviewedAt: nullableString(row.reviewed_at, 'reviewed timestamp'),
    updatedAt: nullableString(row.updated_at, 'updated timestamp'),
    title: nullableString(book.title, 'title'),
    subtitle: nullableString(book.subtitle, 'subtitle'),
    description: nullableString(book.description, 'description'),
    slug: nullableString(book.slug, 'book slug'),
    pages: nullableInteger(book.pages, 'book pages'),
    releaseDate: nullableString(book.release_date, 'release date'),
    releaseYear: nullableInteger(book.release_year, 'release year'),
    workCanonicalId: nullableInteger(book.canonical_id, 'canonical book id'),
    cover: workImage.url === null ? (defaultCoverEdition?.image ?? workImage) : workImage,
    communityRating: nullableNumber(book.rating, 'community rating'),
    communityRatingsCount: nonnegativeInteger(book.ratings_count),
    usersReadCount: nonnegativeInteger(book.users_read_count),
    defaultCoverEditionId: nullableInteger(
      book.default_cover_edition_id,
      'default cover edition id',
    ),
    editionCanonicalId: currentEdition?.canonicalId ?? null,
    isbn10: currentEdition?.isbn10 ?? null,
    isbn13: currentEdition?.isbn13 ?? null,
    asin: currentEdition?.asin ?? null,
    audioSeconds:
      nullableInteger(book.audio_seconds, 'book audio seconds') ??
      currentEdition?.audioSeconds ??
      null,
    currentEdition,
    defaultCoverEdition,
    contributors: parseContributors(book.contributions),
    series: arrayOrEmpty(book.book_series).flatMap((entry) => {
      const series = parseSeries(entry)
      return series === null ? [] : [series]
    }),
    taxonomy: parseTaxonomy(book.cached_tags),
    reads: row.user_book_reads.map(parseRead),
  }
}

async function fetchGraphql(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
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
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      return { bytes, contentType: response.headers.get('content-type') ?? 'application/json' }
    }
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === 3) {
      throw new Error(`Hardcover GraphQL returned ${response.status}`)
    }
    const retryAfter = response.headers.get('retry-after')
    const numericSeconds = retryAfter === null ? Number.NaN : Number(retryAfter)
    const serverDelay = Number.isFinite(numericSeconds)
      ? numericSeconds * 1000
      : retryAfter === null
        ? Number.NaN
        : Date.parse(retryAfter) - Date.now()
    const fallbackDelay = 500 * 2 ** attempt
    const delay = Math.max(
      0,
      Math.min(30_000, Number.isFinite(serverDelay) ? serverDelay : fallbackDelay),
    )
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  throw new Error('Hardcover GraphQL retry loop ended unexpectedly')
}

function parseEnvelope(bytes: Uint8Array): GraphqlEnvelope {
  const envelope = JSON.parse(new TextDecoder().decode(bytes)) as GraphqlEnvelope
  if (envelope.errors !== undefined && envelope.errors.length > 0) {
    const message = envelope.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join('; ')
    throw new Error(`Hardcover GraphQL returned errors${message ? `: ${message}` : ''}`)
  }
  if (envelope.data === undefined) throw new Error('Hardcover GraphQL returned no data')
  return envelope
}

export async function fetchHardcoverUserId(token: string): Promise<number> {
  const result = await fetchGraphql(token, 'query MediaTrackerMe { me { id } }', {})
  const data = record(parseEnvelope(result.bytes).data, 'me response')
  const values = Array.isArray(data.me) ? data.me : [data.me]
  const me = record(values[0], 'me')
  return integer(me.id, 'user id')
}

export async function fetchHardcoverReadBooksResponse(input: {
  token: string
  userId: number
  afterId: number
  limit?: number
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  return fetchGraphql(input.token, libraryBooksQuery, {
    userId: input.userId,
    afterId: input.afterId,
    limit: input.limit ?? 50,
  })
}

export function parseHardcoverReadBooksPage(result: {
  bytes: Uint8Array
  contentType: string
}): HardcoverPage {
  const data = record(parseEnvelope(result.bytes).data, 'library books response')
  if (!Array.isArray(data.user_books)) throw new TypeError('Hardcover user_books must be an array')
  return {
    books: data.user_books.map(parseHardcoverReadBook),
    bytes: result.bytes,
    contentType: result.contentType,
  }
}

export async function fetchHardcoverReadBooksPage(
  input: Parameters<typeof fetchHardcoverReadBooksResponse>[0],
): Promise<HardcoverPage> {
  return parseHardcoverReadBooksPage(await fetchHardcoverReadBooksResponse(input))
}

export async function fetchHardcoverEditionsResponse(input: {
  token: string
  ids: readonly number[]
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  return fetchGraphql(input.token, editionsQuery, { ids: input.ids })
}

export function parseHardcoverEditionsPage(result: {
  bytes: Uint8Array
  contentType: string
}): HardcoverEditionsPage {
  const data = record(parseEnvelope(result.bytes).data, 'editions response')
  if (!Array.isArray(data.editions)) throw new TypeError('Hardcover editions must be an array')
  return {
    editions: data.editions.flatMap((value) => {
      const edition = parseEdition(value)
      return edition === null ? [] : [edition]
    }),
    bytes: result.bytes,
    contentType: result.contentType,
  }
}
