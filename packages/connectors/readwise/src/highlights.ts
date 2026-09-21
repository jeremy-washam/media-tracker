import { z } from 'zod'

const optionalString = z.string().nullable().optional()
export const ReadwiseHighlightSchema = z
  .object({
    id: z.coerce.number().int(),
    is_deleted: z.boolean().default(false),
    text: optionalString,
    note: optionalString,
    location: z.coerce.number().int().nullable().optional(),
    end_location: z.coerce.number().int().nullable().optional(),
    location_type: optionalString,
    color: optionalString,
    is_favorite: z.boolean().default(false),
    is_discard: z.boolean().default(false),
    highlighted_at: optionalString,
    created_at: optionalString,
    updated_at: optionalString,
    readwise_url: optionalString,
  })
  .passthrough()

export const ReadwiseHighlightContainerSchema = z
  .object({
    user_book_id: z.coerce.number().int(),
    is_deleted: z.boolean().default(false),
    external_id: optionalString,
    title: optionalString,
    author: optionalString,
    source: optionalString,
    category: optionalString,
    source_url: optionalString,
    note: optionalString,
    updated: optionalString,
    highlights: z.array(ReadwiseHighlightSchema).default([]),
  })
  .passthrough()

export const ReadwiseHighlightPageSchema = z
  .object({
    count: z.number().nonnegative().optional(),
    nextPageCursor: z.string().nullable().optional(),
    results: z.array(ReadwiseHighlightContainerSchema),
  })
  .passthrough()

export type ReadwiseHighlightContainer = z.infer<typeof ReadwiseHighlightContainerSchema>
export type ReadwiseHighlightPage = z.infer<typeof ReadwiseHighlightPageSchema>
export function parseReadwiseHighlightPage(body: string): ReadwiseHighlightPage {
  return ReadwiseHighlightPageSchema.parse(JSON.parse(body))
}
