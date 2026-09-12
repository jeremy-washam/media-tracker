import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { normalizeReaderDocument, parseReaderPage } from './documents'

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
})
