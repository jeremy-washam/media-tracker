import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'

import { inspectLetterboxdExportBytes } from './export.ts'

function csv(value: string): Uint8Array {
  return strToU8(value.replaceAll('\n', '\r\n'))
}

describe('inspectLetterboxdExportBytes', () => {
  it('distinguishes film URIs from diary-entry URIs and keeps unknown-date watches', () => {
    const archive = zipSync({
      'watched.csv': csv(
        'Date,Name,Year,Letterboxd URI\n2025-01-01,Synthetic One,2024,https://boxd.it/film-one\n2025-01-02,Synthetic Two,2023,https://boxd.it/film-two\n',
      ),
      'diary.csv': csv(
        'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2025-01-03,Synthetic One,2024,https://boxd.it/diary-one,4.5,,,2025-01-02\n',
      ),
      'ratings.csv': csv(
        'Date,Name,Year,Letterboxd URI,Rating\n2025-01-03,Synthetic One,2024,https://boxd.it/film-one,4.5\n',
      ),
      'reviews.csv': csv(
        'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2025-01-03,Synthetic One,2024,https://boxd.it/diary-one,4.5,,Synthetic review,,2025-01-02\n',
      ),
      'watchlist.csv': csv(
        'Date,Name,Year,Letterboxd URI\n2025-01-01,Synthetic Two,2023,https://boxd.it/film-two\n',
      ),
      'likes/films.csv': csv(
        'Date,Name,Year,Letterboxd URI\n2025-01-03,Synthetic One,2024,https://boxd.it/film-one\n',
      ),
      'deleted/diary.csv': csv('Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n'),
      'orphaned/diary.csv': csv('Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n'),
    })

    const summary = inspectLetterboxdExportBytes(archive)

    expect(summary.history).toMatchObject({
      watchedFilms: 2,
      watchedOnlyFilms: 1,
      diaryEntries: 1,
      diaryFilms: 1,
      reviews: 1,
    })
    expect(summary.identities).toMatchObject({
      watchedFilmUris: 2,
      diaryEntryUris: 1,
      diaryUrisMatchingFilmUris: 0,
      ratingsUsingWatchedFilmUri: 1,
      reviewsUsingDiaryEntryUri: 1,
    })
    expect(summary.queue).toEqual({ watchlistItems: 1, watchlistAlreadyWatched: 1 })
  })
})
