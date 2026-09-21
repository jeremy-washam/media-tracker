import type { ArticleCollectionItem } from '@media-tracker/contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  articleTextExcerptConcurrency,
  articleTextExcerptLimit,
  hydrateArticleTextExcerpts,
} from './article-excerpts'

function item(index: number): ArticleCollectionItem {
  return {
    id: `article-${index}`,
    title: `Article ${index}`,
    subtype: 'article',
    imageUrl: null,
    author: null,
    publication: null,
    publishedAt: null,
    readingTime: { raw: null, minutes: null },
    progress: { value: null, valid: false },
    opened: false,
    archive: { active: true, count: 1, latestAt: null },
    queue: { active: false, state: null, addedAt: null },
    feed: { active: false, arrivedAt: null },
    currentAvailable: true,
    searchExcerpt: { source: 'text', text: null },
  }
}

describe('Article text excerpts', () => {
  it('caps R2 reads and hydrates them with bounded concurrency', async () => {
    const items = Array.from({ length: articleTextExcerptLimit + 4 }, (_, index) => item(index))
    let active = 0
    let maximumActive = 0
    const get = vi.fn(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      return { text: async () => 'A bounded matching excerpt.' }
    })
    await hydrateArticleTextExcerpts({
      items,
      query: 'matching',
      repository: {
        findArticleTextExcerptTarget: async (mediaItemId) => ({
          objectKey: mediaItemId,
          byteStart: 0,
          byteLength: 28,
        }),
      },
      bucket: { get } as unknown as Pick<R2Bucket, 'get'>,
    })

    expect(get).toHaveBeenCalledTimes(articleTextExcerptLimit)
    expect(maximumActive).toBeLessThanOrEqual(articleTextExcerptConcurrency)
    expect(
      items.slice(0, articleTextExcerptLimit).every((value) => value.searchExcerpt?.text),
    ).toBe(true)
    expect(
      items.slice(articleTextExcerptLimit).every((value) => value.searchExcerpt?.text === null),
    ).toBe(true)
  })

  it('keeps metadata results when target lookup, R2 get, or body reads fail', async () => {
    const items = Array.from({ length: 6 }, (_, index) => item(index))
    const get = vi.fn(async (key: string) => {
      if (key === 'article-1') throw new Error('R2 unavailable')
      return {
        text: async () => {
          if (key === 'article-2') throw new Error('R2 stream failed')
          return 'A surviving matching excerpt.'
        },
      }
    })
    await expect(
      hydrateArticleTextExcerpts({
        items,
        query: 'matching',
        repository: {
          findArticleTextExcerptTarget: async (mediaItemId) => {
            if (mediaItemId === 'article-0') throw new Error('D1 lookup failed')
            return { objectKey: mediaItemId, byteStart: 0, byteLength: 28 }
          },
        },
        bucket: { get } as unknown as Pick<R2Bucket, 'get'>,
      }),
    ).resolves.toBeUndefined()
    expect(items.slice(0, 3).every((value) => value.searchExcerpt?.text === null)).toBe(true)
    expect(items.slice(3).every((value) => value.searchExcerpt?.text)).toBe(true)
  })
})
