import { z } from 'zod'
import { calendarDate, calendarMonth, calendarYear } from '@media-tracker/domain'

export const CalendarDateSchema = z.string().refine((value) => {
  try {
    calendarDate(value)
    return true
  } catch {
    return false
  }
}, 'Expected a valid calendar date in YYYY-MM-DD format.')

export const PublicationBoundarySchema = z.string().refine((value) => {
  try {
    if (value.length === 4) calendarYear(value)
    else if (value.length === 7) calendarMonth(value)
    else calendarDate(value)
    return true
  } catch {
    return false
  }
}, 'Expected a valid year, month, or calendar date.')

// Query text is a bounded user input, never a source-evidence field.
export const QueryTextSchema = z.string().trim().max(500)

// Date precision describes an interval: an end year includes its whole year.
export function rangeIsReversed(from: string | undefined, to: string | undefined): boolean {
  if (from === undefined || to === undefined) return false
  const lower = from.length === 4 ? `${from}-01-01` : from.length === 7 ? `${from}-01` : from
  const upper = to.length === 4 ? `${to}-12-31` : to.length === 7 ? `${to}-31` : to
  return lower > upper
}

// Several facets share one SQL statement; individually bounded lists are insufficient.
export function validateFacetBudget(
  lists: readonly (readonly string[])[],
  context: z.RefinementCtx,
) {
  if (lists.reduce((total, values) => total + values.length, 0) > 50) {
    context.addIssue({ code: 'custom', message: 'Select at most 50 facet values in one query.' })
  }
}
