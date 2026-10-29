import { ReadwiseApiError } from '@media-tracker/connector-readwise'

const maximumAttempts = 3
const maximumRetryDelayMilliseconds = 5_000

function retryDelayMilliseconds(value: string | null, now = Date.now()): number {
  if (value === null) return 1_000
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : 1_000
}

export async function withReadwiseRetry<T>(
  request: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      if (
        !(error instanceof ReadwiseApiError) ||
        error.status !== 429 ||
        attempt >= maximumAttempts
      )
        throw error
      const delay = retryDelayMilliseconds(error.retryAfter)
      // End this attempt rather than retry earlier than the provider permits.
      if (delay > maximumRetryDelayMilliseconds) throw error
      await wait(delay)
    }
  }
}
