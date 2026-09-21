import { describe, expect, it } from 'vitest'

import { ArticlesQuerySchema } from './articles'

describe('ArticlesQuerySchema', () => {
  it('parses repeated facets and independent unknown-date inclusion', () => {
    expect(
      ArticlesQuerySchema.parse({
        section: 'archive',
        type: 'article,pdf',
        readingTime: ['under5', '5to15'],
        progress: 'notOpened,inProgress',
        publishedFrom: '2026-01-01',
        publishedUnknown: 'true',
      }),
    ).toMatchObject({
      type: ['article', 'pdf'],
      readingTime: ['under5', '5to15'],
      progress: ['notOpened', 'inProgress'],
      publishedFrom: '2026-01-01',
      publishedUnknown: true,
    })
  })

  it('rejects section-only filters from another Article section', () => {
    expect(() => ArticlesQuerySchema.parse({ section: 'archive', queueState: 'later' })).toThrow(
      'another section',
    )
  })

  it('rejects reversed date ranges', () => {
    expect(() =>
      ArticlesQuerySchema.parse({
        section: 'archive',
        archivedFrom: '2026-09-20',
        archivedTo: '2026-09-19',
      }),
    ).toThrow('end date')
  })
})
