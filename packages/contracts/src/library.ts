import { z } from 'zod'

export const LIBRARY_PAGE_SIZE = 50
const summaryExcluded = [
  'sort',
  'direction',
  'layout',
  'view',
  'density',
  'limit',
  'cursor',
] as const
type SummaryExcluded = (typeof summaryExcluded)[number]

export function librarySummaryQuery<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const fields = Object.fromEntries(
    Object.entries(schema.shape).filter(
      ([key]) => !(summaryExcluded as readonly string[]).includes(key),
    ),
  ) as Omit<T, SummaryExcluded>
  return z.strictObject(fields).superRefine((value, context) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  })
}
