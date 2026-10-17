export async function fetchLibrarySummary<T>(
  media: string,
  filters: object,
  parse: (value: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || value === false) continue
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','))
    } else search.set(key, String(value))
  }
  const response = await fetch(`/api/library/${media}/summary?${search}`, {
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) throw new Error(`Library summary request failed (${response.status}).`)
  return parse(await response.json())
}

export class InvalidLibraryCursorError extends Error {
  constructor() {
    super('This collection changed. Refresh it to load more.')
    this.name = 'InvalidLibraryCursorError'
  }
}

export function checkLibraryCursorResponse(status: number, body: unknown): void {
  if (status !== 400 || typeof body !== 'object' || body === null || !('error' in body)) return
  const error = body.error
  if (typeof error !== 'object' || error === null || !('message' in error)) return
  if (typeof error.message === 'string' && /pagination cursor/i.test(error.message)) {
    throw new InvalidLibraryCursorError()
  }
}
