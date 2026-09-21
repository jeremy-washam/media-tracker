import { describe, expect, it } from 'vitest'

import { parseReadwiseHighlightPage } from './highlights'

describe('parseReadwiseHighlightPage', () => {
  it('preserves deletion and discard evidence from the v2 export shape', () => {
    const page = parseReadwiseHighlightPage(
      JSON.stringify({
        count: 1,
        nextPageCursor: 'next',
        results: [
          {
            user_book_id: 41,
            external_id: 'reader-document-1',
            source: 'reader',
            title: 'An article',
            is_deleted: false,
            highlights: [
              {
                id: 7,
                text: 'Retained text',
                note: 'A note',
                location: 12,
                is_favorite: true,
                is_discard: false,
                is_deleted: false,
              },
              {
                id: 8,
                text: 'Deleted text',
                is_discard: false,
                is_deleted: true,
              },
              {
                id: 9,
                text: 'Discarded text',
                is_discard: true,
                is_deleted: false,
              },
            ],
          },
        ],
      }),
    )

    expect(page.nextPageCursor).toBe('next')
    expect(page.results[0]).toMatchObject({
      user_book_id: 41,
      external_id: 'reader-document-1',
      source: 'reader',
    })
    expect(page.results[0]?.highlights).toMatchObject([
      { id: 7, is_deleted: false, is_discard: false, is_favorite: true },
      { id: 8, is_deleted: true, is_discard: false },
      { id: 9, is_deleted: false, is_discard: true },
    ])
  })
})
