import { unzipSync } from 'fflate'

type CsvRow = Record<string, string>

export interface LetterboxdExportFileSummary {
  path: string
  format: 'csv' | 'list-v7'
  headers: string[]
  rows: number
  metadataHeaders?: string[]
}

export interface LetterboxdExportSummary {
  archiveBytes: number
  files: LetterboxdExportFileSummary[]
  history: {
    watchedFilms: number
    watchedOnlyFilms: number
    diaryEntries: number
    diaryFilms: number
    diaryEntriesWithRating: number
    rewatchEntries: number
    duplicateDiaryKeys: number
    reviews: number
    currentRatings: number
    likedFilms: number
    watchedDateRange: DateRange
  }
  identities: {
    watchedFilmUris: number
    diaryEntryUris: number
    diaryUrisMatchingFilmUris: number
    ratingsUsingWatchedFilmUri: number
    reviewsUsingDiaryEntryUri: number
    exportFilmJoin: 'exact Name + Year'
  }
  queue: {
    watchlistItems: number
    watchlistAlreadyWatched: number
  }
  deletionEvidence: {
    deletedRows: number
    orphanedRows: number
  }
}

interface DateRange {
  earliest: string | null
  latest: string | null
}

interface ParsedExportFile {
  summary: LetterboxdExportFileSummary
  rows: CsvRow[]
}

export interface LetterboxdRecordReference {
  recordPath: string
  sourceRecordKey: string
  sourceRecordedOn: string | null
}

export interface LetterboxdDiaryOccurrence extends LetterboxdRecordReference {
  diaryUri: string
  consumedOn: string
  rating: number | null
  reviewText: string | null
  reviewRecord: LetterboxdRecordReference | null
}

export interface LetterboxdFilm {
  filmUri: string
  title: string
  releaseYear: string
  watchedRecord: LetterboxdRecordReference
  currentRating: number | null
  ratingRecord: LetterboxdRecordReference | null
  diaryOccurrences: LetterboxdDiaryOccurrence[]
}

export interface LetterboxdExportProjection {
  films: LetterboxdFilm[]
  unresolvedDiaryRecords: LetterboxdRecordReference[]
}

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

function parseCsvMatrix(text: string): string[][] {
  const input = text.startsWith('\uFEFF') ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const finishRow = () => {
    row.push(field)
    if (row.some((value) => value.length > 0)) rows.push(row)
    row = []
    field = ''
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (!quoted && character === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && input[index + 1] === '\n') index += 1
      finishRow()
      continue
    }
    field += character
  }

  if (quoted) throw new Error('Letterboxd export contains an unterminated quoted CSV field')
  if (field.length > 0 || row.length > 0) finishRow()
  return rows
}

function parseCsv(text: string): CsvRow[] {
  const [headers, ...rows] = parseCsvMatrix(text)
  if (headers === undefined) return []
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  )
}

function splitLines(text: string): string[] {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
}

function parseList(path: string, text: string): ParsedExportFile {
  const lines = splitLines(text)
  const separator = lines.findIndex((line, index) => index > 0 && line.length === 0)

  if (separator < 3 || separator + 1 >= lines.length) {
    throw new Error(`Unsupported Letterboxd list export shape: ${path}`)
  }

  const metadata = parseCsv(lines.slice(1, separator).join('\n'))
  const rows = parseCsv(lines.slice(separator + 1).join('\n'))

  return {
    summary: {
      path,
      format: 'list-v7',
      headers: Object.keys(rows[0] ?? {}),
      rows: rows.length,
      metadataHeaders: Object.keys(metadata[0] ?? {}),
    },
    rows,
  }
}

function parseExportFile(path: string, bytes: Uint8Array): ParsedExportFile {
  const text = decoder.decode(bytes)

  if (text.startsWith('Letterboxd list export v7')) {
    return parseList(path, text)
  }

  const rows = parseCsv(text)
  const headerLine = splitLines(text)[0] ?? ''
  const headers = parseCsvMatrix(`${headerLine}\n`)

  return {
    summary: {
      path,
      format: 'csv',
      headers: headers[0] ?? [],
      rows: rows.length,
    },
    rows,
  }
}

function dateRange(rows: CsvRow[], field: string): DateRange {
  const values = rows
    .map((row) => row[field])
    .filter((value): value is string => value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()

  return {
    earliest: values[0] ?? null,
    latest: values.at(-1) ?? null,
  }
}

function valueSet(rows: CsvRow[], field: string): Set<string> {
  return new Set(
    rows
      .map((row) => row[field])
      .filter((value): value is string => value !== undefined && value.length > 0),
  )
}

function filmKey(row: CsvRow): string | null {
  const name = row.Name
  const year = row.Year
  return name === undefined || name.length === 0 || year === undefined || year.length === 0
    ? null
    : `${name}\u0000${year}`
}

function filmKeySet(rows: CsvRow[]): Set<string> {
  return new Set(rows.map(filmKey).filter((value): value is string => value !== null))
}

function requireRows(files: Map<string, ParsedExportFile>, path: string): CsvRow[] {
  const file = files.get(path)
  if (file === undefined) {
    throw new Error(`Letterboxd export is missing ${path}`)
  }
  return file.rows
}

function requiredValue(row: CsvRow, field: string, path: string): string {
  const value = row[field]?.trim()
  if (value === undefined || value.length === 0) {
    throw new Error(`Letterboxd export ${path} is missing ${field}`)
  }
  return value
}

function optionalDate(row: CsvRow, field: string, path: string): string | null {
  const value = row[field]?.trim()
  if (value === undefined || value.length === 0) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Letterboxd export ${path} has an invalid ${field}`)
  }
  return value
}

function requiredYear(row: CsvRow, path: string): string {
  const value = requiredValue(row, 'Year', path)
  if (!/^\d{4}$/.test(value)) throw new Error(`Letterboxd export ${path} has an invalid Year`)
  return value
}

function optionalRating(row: CsvRow, path: string): number | null {
  const raw = row.Rating?.trim()
  if (raw === undefined || raw.length === 0) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0.5 || value > 5 || value * 2 !== Math.round(value * 2)) {
    throw new Error(`Letterboxd export ${path} has an invalid Rating`)
  }
  return value
}

function recordReference(
  file: string,
  index: number,
  sourceRecordKey: string,
  sourceRecordedOn: string | null,
): LetterboxdRecordReference {
  return {
    recordPath: `${file}#row=${index + 2}`,
    sourceRecordKey,
    sourceRecordedOn,
  }
}

export function parseLetterboxdExportBytes(archive: Uint8Array): LetterboxdExportProjection {
  let entries: ReturnType<typeof unzipSync>
  try {
    entries = unzipSync(archive)
  } catch {
    throw new Error('The selected file is not a valid Letterboxd ZIP export')
  }

  const files = new Map<string, ParsedExportFile>()
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith('.csv')) files.set(path, parseExportFile(path, bytes))
  }

  const watchedRows = requireRows(files, 'watched.csv')
  const diaryRows = requireRows(files, 'diary.csv')
  const ratingRows = requireRows(files, 'ratings.csv')
  const reviewRows = requireRows(files, 'reviews.csv')

  const ratingByFilmUri = new Map<string, { rating: number; record: LetterboxdRecordReference }>()
  for (const [index, row] of ratingRows.entries()) {
    const path = `ratings.csv#row=${index + 2}`
    const filmUri = requiredValue(row, 'Letterboxd URI', path)
    const rating = optionalRating(row, path)
    if (rating === null) continue
    ratingByFilmUri.set(filmUri, {
      rating,
      record: recordReference('ratings.csv', index, filmUri, optionalDate(row, 'Date', path)),
    })
  }

  const reviewByDiaryUri = new Map<
    string,
    { reviewText: string; record: LetterboxdRecordReference }
  >()
  for (const [index, row] of reviewRows.entries()) {
    const path = `reviews.csv#row=${index + 2}`
    const diaryUri = requiredValue(row, 'Letterboxd URI', path)
    const reviewText = row.Review?.trim() ?? ''
    if (reviewText.length === 0) continue
    if (reviewByDiaryUri.has(diaryUri)) {
      throw new Error(`Letterboxd export contains multiple reviews for ${diaryUri}`)
    }
    reviewByDiaryUri.set(diaryUri, {
      reviewText,
      record: recordReference('reviews.csv', index, diaryUri, optionalDate(row, 'Date', path)),
    })
  }

  const films: LetterboxdFilm[] = []
  const filmByKey = new Map<string, LetterboxdFilm>()
  for (const [index, row] of watchedRows.entries()) {
    const path = `watched.csv#row=${index + 2}`
    const title = requiredValue(row, 'Name', path)
    const releaseYear = requiredYear(row, path)
    const filmUri = requiredValue(row, 'Letterboxd URI', path)
    const key = `${title}\u0000${releaseYear}`
    if (filmByKey.has(key)) {
      throw new Error(`Letterboxd export has an ambiguous watched-film identity for ${title}`)
    }
    const currentRating = ratingByFilmUri.get(filmUri) ?? null
    const film: LetterboxdFilm = {
      filmUri,
      title,
      releaseYear,
      watchedRecord: recordReference(
        'watched.csv',
        index,
        filmUri,
        optionalDate(row, 'Date', path),
      ),
      currentRating: currentRating?.rating ?? null,
      ratingRecord: currentRating?.record ?? null,
      diaryOccurrences: [],
    }
    films.push(film)
    filmByKey.set(key, film)
  }

  const unresolvedDiaryRecords: LetterboxdRecordReference[] = []
  for (const [index, row] of diaryRows.entries()) {
    const path = `diary.csv#row=${index + 2}`
    const title = requiredValue(row, 'Name', path)
    const releaseYear = requiredYear(row, path)
    const diaryUri = requiredValue(row, 'Letterboxd URI', path)
    const sourceRecordedOn = optionalDate(row, 'Date', path)
    const record = recordReference('diary.csv', index, diaryUri, sourceRecordedOn)
    const film = filmByKey.get(`${title}\u0000${releaseYear}`)
    if (film === undefined) {
      unresolvedDiaryRecords.push(record)
      continue
    }
    const consumedOn = optionalDate(row, 'Watched Date', path)
    if (consumedOn === null) throw new Error(`Letterboxd export ${path} is missing Watched Date`)
    const review = reviewByDiaryUri.get(diaryUri) ?? null
    film.diaryOccurrences.push({
      ...record,
      diaryUri,
      consumedOn,
      rating: optionalRating(row, path),
      reviewText: review?.reviewText ?? null,
      reviewRecord: review?.record ?? null,
    })
  }

  return { films, unresolvedDiaryRecords }
}

export function inspectLetterboxdExportBytes(archive: Uint8Array): LetterboxdExportSummary {
  const entries = unzipSync(archive)
  const files = new Map<string, ParsedExportFile>()

  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.endsWith('.csv')) continue
    files.set(path, parseExportFile(path, bytes))
  }

  const watched = requireRows(files, 'watched.csv')
  const diary = requireRows(files, 'diary.csv')
  const ratings = requireRows(files, 'ratings.csv')
  const reviews = requireRows(files, 'reviews.csv')
  const watchlist = requireRows(files, 'watchlist.csv')
  const likedFilms = requireRows(files, 'likes/films.csv')
  const watchedUris = valueSet(watched, 'Letterboxd URI')
  const diaryUris = valueSet(diary, 'Letterboxd URI')
  const ratingUris = valueSet(ratings, 'Letterboxd URI')
  const reviewUris = valueSet(reviews, 'Letterboxd URI')
  const watchedFilmKeys = filmKeySet(watched)
  const diaryFilmKeys = filmKeySet(diary)
  const watchlistFilmKeys = filmKeySet(watchlist)

  const diaryKeys = diary.map(
    (row) => `${row['Letterboxd URI'] ?? ''}\u0000${row['Watched Date'] ?? ''}`,
  )
  const uniqueDiaryKeys = new Set(diaryKeys)
  const deletedRows = [...files.entries()]
    .filter(([path]) => path.startsWith('deleted/'))
    .reduce((count, [, file]) => count + file.rows.length, 0)
  const orphanedRows = [...files.entries()]
    .filter(([path]) => path.startsWith('orphaned/'))
    .reduce((count, [, file]) => count + file.rows.length, 0)

  return {
    archiveBytes: archive.byteLength,
    files: [...files.values()]
      .map((file) => file.summary)
      .sort((a, b) => a.path.localeCompare(b.path)),
    history: {
      watchedFilms: watchedUris.size,
      watchedOnlyFilms: [...watchedFilmKeys].filter((key) => !diaryFilmKeys.has(key)).length,
      diaryEntries: diary.length,
      diaryFilms: diaryFilmKeys.size,
      diaryEntriesWithRating: diary.filter((row) => (row.Rating ?? '').length > 0).length,
      rewatchEntries: diary.filter((row) => (row.Rewatch ?? '').toLowerCase() === 'yes').length,
      duplicateDiaryKeys: diaryKeys.length - uniqueDiaryKeys.size,
      reviews: reviews.length,
      currentRatings: ratings.length,
      likedFilms: likedFilms.length,
      watchedDateRange: dateRange(diary, 'Watched Date'),
    },
    identities: {
      watchedFilmUris: watchedUris.size,
      diaryEntryUris: diaryUris.size,
      diaryUrisMatchingFilmUris: [...diaryUris].filter((uri) => watchedUris.has(uri)).length,
      ratingsUsingWatchedFilmUri: [...ratingUris].filter((uri) => watchedUris.has(uri)).length,
      reviewsUsingDiaryEntryUri: [...reviewUris].filter((uri) => diaryUris.has(uri)).length,
      exportFilmJoin: 'exact Name + Year',
    },
    queue: {
      watchlistItems: watchlist.length,
      watchlistAlreadyWatched: [...watchlistFilmKeys].filter((key) => watchedFilmKeys.has(key))
        .length,
    },
    deletionEvidence: {
      deletedRows,
      orphanedRows,
    },
  }
}
