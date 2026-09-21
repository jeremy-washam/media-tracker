import type { ArticleCollectionItem } from '@media-tracker/contracts'

export const articleTextExcerptLimit = 8
export const articleTextExcerptConcurrency = 4

interface ExcerptRepository {
  findArticleTextExcerptTarget(
    mediaItemId: string,
    query: string,
  ): Promise<{ objectKey: string; byteStart: number; byteLength: number } | null>
}

function excerpt(body: string, query: string): string {
  const normalizedBody = body.replace(/\s+/g, ' ').trim()
  const queryText = query.toLocaleLowerCase('en-US')
  const haystack = normalizedBody.toLocaleLowerCase('en-US')
  let match = haystack.indexOf(queryText)
  if (match < 0) {
    for (const token of queryText.split(/\s+/).filter(Boolean)) {
      match = haystack.indexOf(token)
      if (match >= 0) break
    }
  }
  const start = Math.max(0, match < 0 ? 0 : match - 70)
  const end = Math.min(normalizedBody.length, start + 180)
  return `${start > 0 ? '…' : ''}${normalizedBody.slice(start, end)}${end < normalizedBody.length ? '…' : ''}`
}

export async function hydrateArticleTextExcerpts(input: {
  items: ArticleCollectionItem[]
  query: string
  repository: ExcerptRepository
  bucket: Pick<R2Bucket, 'get'>
}): Promise<void> {
  const candidates = input.items
    .filter((item) => item.searchExcerpt?.source === 'text' && item.searchExcerpt.text === null)
    .slice(0, articleTextExcerptLimit)
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < candidates.length) {
      const item = candidates[nextIndex++]!
      try {
        const target = await input.repository.findArticleTextExcerptTarget(item.id, input.query)
        if (target === null) continue
        const object = await input.bucket.get(target.objectKey, {
          range: { offset: target.byteStart, length: target.byteLength },
        })
        if (object === null || item.searchExcerpt === null) continue
        item.searchExcerpt.text = excerpt(await object.text(), input.query)
      } catch {
        // Excerpts are optional enrichment; the otherwise valid metadata result remains usable.
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(articleTextExcerptConcurrency, candidates.length) }, async () =>
      worker(),
    ),
  )
}
