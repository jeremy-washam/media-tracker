import { describe, expect, it } from 'vitest'

import { parseHardcoverReadBook } from './client'

describe('Hardcover read-book parser', () => {
  it('keeps work, edition, rating, review, and finished-read facts distinct', () => {
    const book = parseHardcoverReadBook({
      id: 501,
      book_id: 701,
      edition_id: 801,
      status_id: 3,
      read_count: 2,
      rating: 4.5,
      review: 'A synthetic review.',
      updated_at: '2026-09-11T18:30:00Z',
      book: {
        id: 701,
        canonical_id: null,
        title: 'A Synthetic Book',
        subtitle: 'Testing the Archive',
        release_date: '2020-04-12',
        release_year: 2020,
      },
      edition: {
        id: 801,
        canonical_id: null,
        isbn_10: '1234567890',
        isbn_13: '9781234567890',
        asin: 'B000SYNTH',
        audio_seconds: null,
      },
      user_book_reads: [
        {
          id: 901,
          edition_id: 801,
          finished_at: '2024-02-03',
          finished_at_precision: 3,
        },
      ],
    })

    expect(book).toMatchObject({
      userBookId: 501,
      bookId: 701,
      editionId: 801,
      readCount: 2,
      rating: 4.5,
      title: 'A Synthetic Book',
      isbn13: '9781234567890',
    })
    expect(book.reads).toEqual([
      { id: 901, editionId: 801, finishedAt: '2024-02-03', finishedAtPrecision: 3 },
    ])
  })

  it('rejects malformed source rows instead of manufacturing an item', () => {
    expect(() => parseHardcoverReadBook({ id: 'not-an-id' })).toThrow()
  })
})
