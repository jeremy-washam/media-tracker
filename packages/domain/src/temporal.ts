declare const temporalBrand: unique symbol

export type CalendarDate = string & { readonly [temporalBrand]: 'CalendarDate' }
export type CalendarMonth = string & { readonly [temporalBrand]: 'CalendarMonth' }
export type CalendarYear = string & { readonly [temporalBrand]: 'CalendarYear' }
export type UtcInstant = string & { readonly [temporalBrand]: 'UtcInstant' }

export type TemporalBasis = 'source_asserted' | 'inferred'

export type TemporalValue =
  | Readonly<{ basis: TemporalBasis; precision: 'year'; value: CalendarYear }>
  | Readonly<{ basis: TemporalBasis; precision: 'month'; value: CalendarMonth }>
  | Readonly<{ basis: TemporalBasis; precision: 'day'; value: CalendarDate }>
  | Readonly<{ basis: TemporalBasis; precision: 'instant'; value: UtcInstant }>

function assertCalendarParts(year: number, month: number, day: number): void {
  const candidate = new Date(0)
  candidate.setUTCHours(0, 0, 0, 0)
  candidate.setUTCFullYear(year, month - 1, day)

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new TypeError('Invalid calendar date')
  }
}

export function calendarYear(value: string): CalendarYear {
  if (!/^\d{4}$/.test(value)) throw new TypeError('Calendar year must use YYYY')
  return value as CalendarYear
}

export function calendarMonth(value: string): CalendarMonth {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (match === null) throw new TypeError('Calendar month must use YYYY-MM')

  const month = Number(match[2])
  if (month < 1 || month > 12) throw new TypeError('Invalid calendar month')
  return value as CalendarMonth
}

export function calendarDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) throw new TypeError('Calendar date must use YYYY-MM-DD')

  assertCalendarParts(Number(match[1]), Number(match[2]), Number(match[3]))
  return value as CalendarDate
}

export function utcInstant(value: string): UtcInstant {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new TypeError('Instant must include a UTC offset')
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    )
  if (match === null) throw new TypeError('Invalid instant')
  assertCalendarParts(Number(match[1]), Number(match[2]), Number(match[3]))
  if (
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59 ||
    Number(match[7] ?? 0) > 23 ||
    Number(match[8] ?? 0) > 59
  )
    throw new TypeError('Invalid instant')
  const milliseconds = Date.parse(value)
  if (Number.isNaN(milliseconds)) throw new TypeError('Invalid instant')
  return new Date(milliseconds).toISOString() as UtcInstant
}

export const temporalYear = (
  value: string,
  basis: TemporalBasis = 'source_asserted',
): TemporalValue => ({ basis, precision: 'year', value: calendarYear(value) })

export const temporalMonth = (
  value: string,
  basis: TemporalBasis = 'source_asserted',
): TemporalValue => ({ basis, precision: 'month', value: calendarMonth(value) })

export const temporalDay = (
  value: string,
  basis: TemporalBasis = 'source_asserted',
): TemporalValue => ({ basis, precision: 'day', value: calendarDate(value) })

export const temporalInstant = (
  value: string,
  basis: TemporalBasis = 'source_asserted',
): TemporalValue => ({ basis, precision: 'instant', value: utcInstant(value) })
