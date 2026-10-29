/** Refresh seven days before the 30-day provider cache deadline. The request
 * clock remains real: this timestamp is only a candidate-selection boundary. */
export const tmdbMatcherVersion = 'tmdb-evidence@2'
export const catalogRefreshLeadDays = 7
export const spotifyRefreshDays = 21
export const articleTargetsPerHour = 20
export const articleMaximumAttempts = 3
export const catalogMaximumRetryAttempts = 8

export function catalogRefreshBefore(at: string): string {
  return new Date(Date.parse(at) + catalogRefreshLeadDays * 86_400_000).toISOString()
}

export function spotifyStaleBefore(at: string): string {
  return new Date(Date.parse(at) - spotifyRefreshDays * 86_400_000).toISOString()
}

export function dailyCatalogJobId(provider: 'tmdb' | 'youtube', at: string): string {
  return `catalog:${provider}:${new Date(at).toISOString().slice(0, 10)}`
}

/** Count reservations without durable item progress, rather than imposing a
 * lifetime cap on a legitimate large-library refresh. Completion and phase
 * switches have a small allowance in addition to retried provider batches. */
export function catalogRetryLimitReached(
  job: { attemptCount: number; requestedCount: number },
  batchSize: number,
): boolean {
  return job.attemptCount - Math.ceil(job.requestedCount / batchSize) >= catalogMaximumRetryAttempts
}

/** Parse seconds or an HTTP date without retrying before the provider permits. */
export function retryAfterSeconds(
  value: string | number | null | undefined,
  now = Date.now(),
): number {
  if (value === null || value === undefined || value === '') return 60
  const numeric = Number(value)
  const seconds = Number.isFinite(numeric) ? numeric : (Date.parse(String(value)) - now) / 1000
  return Number.isFinite(seconds) && seconds >= 0 ? Math.max(1, Math.ceil(seconds)) : 60
}
