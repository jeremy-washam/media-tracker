import { describe, expect, it } from 'vitest'
import {
  articleCollectionQuerySearch,
  normalizedForArticleSection,
  parseArticlesRouteSearch,
} from './articles-route-search'

describe('Articles route search', () => {
  it('clears incompatible filters and sorts when sections change', () => {
    expect(
      normalizedForArticleSection(
        { sort: 'archivedAt', archivedUnknown: true, currentState: ['feed'] },
        'queue',
      ),
    ).toEqual({})
    expect(
      normalizedForArticleSection(
        { sort: 'addedAt', addedUnknown: true, queueState: ['later'] },
        'feed',
      ),
    ).toEqual({})
  })

  it('keeps presentation state out of the collection request', () => {
    expect(
      articleCollectionQuerySearch({ q: 'reader', item: 'article-1', density: 'expanded' }),
    ).toEqual({ q: 'reader' })
  })

  it('keeps independently addressable date boundaries and unknown inclusion', () => {
    expect(
      articleCollectionQuerySearch({ publishedFrom: '2026-01-01', publishedUnknown: true }),
    ).toEqual({ publishedFrom: '2026-01-01', publishedUnknown: true })
  })

  it('parses repeated-value filters as stable unique arrays', () => {
    expect(
      parseArticlesRouteSearch({
        type: 'article,pdf,article',
        readingTime: ['5to15', '31to60'],
        progress: 'notOpened,openedZero',
      }),
    ).toMatchObject({
      type: ['article', 'pdf'],
      readingTime: ['5to15', '31to60'],
      progress: ['notOpened', 'openedZero'],
    })
  })
})
