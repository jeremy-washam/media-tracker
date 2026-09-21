import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { normalizeReaderDocument, parseReaderMinutes, parseReaderPage } from './documents'

const fixture = readFileSync(
  new URL('../../../test-fixtures/readwise/archive-page.json', import.meta.url),
  'utf8',
)

describe('Reader document normalization', () => {
  it('admits only approved archived media categories', () => {
    const page = parseReaderPage(fixture)
    const normalized = page.results.map(normalizeReaderDocument)

    expect(normalized.flatMap((document) => document.archive?.mediaType ?? [])).toEqual([
      'article',
      'article',
      'article',
      'video',
      'podcast_episode',
    ])
    expect(
      normalized
        .filter((document) => document.archive === null)
        .map(({ documentId }) => documentId),
    ).toEqual(['reader-tweet-1', 'reader-later-1'])
  })

  it('keeps Reader movement time explicitly inferred', () => {
    const document = normalizeReaderDocument(parseReaderPage(fixture).results[0]!)

    expect(document.archive?.consumedAt).toEqual({
      basis: 'inferred',
      precision: 'instant',
      value: '2026-09-10T20:00:00.000Z',
    })
    expect(document.archive?.publishedAt).toEqual({
      basis: 'source_asserted',
      precision: 'day',
      value: '2026-08-01',
    })
  })

  it('preserves Article-specific current-state facts and rejects invalid progress', () => {
    const normalized = normalizeReaderDocument({
      id: 'reader-article',
      category: 'article',
      location: 'later',
      title: 'An article',
      author: 'Author',
      site_name: 'Publication',
      reading_time: '12 mins',
      reading_progress: 1.2,
      tags: { important: { name: 'Important', type: 'manual', created: 123 } },
      saved_at: '2026-09-20T10:00:00.000Z',
    })

    expect(normalized.article).toMatchObject({
      subtype: 'article',
      location: 'later',
      publication: 'Publication',
      readingTimeRaw: '12 mins',
      readingTimeMinutes: 12,
      readingProgress: null,
      progressValid: false,
      tags: [{ key: 'important', name: 'Important', type: 'manual', created: '123' }],
    })
    expect(normalized.archive).toBeNull()
  })

  it.each([
    ['1 hr 5 mins', 65],
    ['1 hr 42 mins', 102],
    ['2 hrs 3 mins', 123],
    ['1.5 hours', 90],
    ['12 mins', 12],
    ['7', 7],
  ])('normalizes Reader reading time %s to minutes', (raw, expected) => {
    expect(parseReaderMinutes(raw)).toBe(expected)
  })

  it('keeps only safe absolute HTTP links', () => {
    const normalized = normalizeReaderDocument({
      id: 'unsafe-links',
      category: 'article',
      location: 'archive',
      title: 'Unsafe links',
      url: 'javascript:alert(1)',
      source_url: 'not a URL',
      image_url: 'data:image/svg+xml,unsafe',
    })

    expect(normalized.article).toMatchObject({ readerUrl: null, sourceUrl: null, imageUrl: null })
    expect(normalized.archive).toMatchObject({ canonicalUrl: null, imageUrl: null })
  })
})
