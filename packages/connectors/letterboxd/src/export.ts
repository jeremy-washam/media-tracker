import { readFile } from 'node:fs/promises'

import { parse } from 'csv-parse/sync'
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

const decoder = new TextDecoder('utf-8', { fatal: true })

function parseCsv(text: string, fromLine = 1): CsvRow[] {
  return parse(text, {
    bom: true,
    columns: true,
    from_line: fromLine,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
  }) as CsvRow[]
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
  const headers = parse(`${headerLine}\n`, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][]

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

export async function inspectLetterboxdExport(
  archivePath: string,
): Promise<LetterboxdExportSummary> {
  return inspectLetterboxdExportBytes(await readFile(archivePath))
}
