import { ReadwiseApiError } from '@media-tracker/connector-readwise'
import { describe, expect, it, vi } from 'vitest'

import { withReadwiseRetry } from './readwise-retry'

describe('Readwise rate-limit retry', () => {
  it('honors Retry-After before retrying a bounded number of times', async () => {
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ReadwiseApiError(429, '2'))
      .mockResolvedValue('ok')
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue()

    await expect(withReadwiseRetry(request, wait)).resolves.toBe('ok')
    expect(wait).toHaveBeenCalledWith(2_000)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('propagates the final rate limit after three attempts', async () => {
    const error = new ReadwiseApiError(429, '0')
    const request = vi.fn<() => Promise<never>>().mockRejectedValue(error)

    await expect(withReadwiseRetry(request, async () => undefined)).rejects.toBe(error)
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('defers long Retry-After responses without retrying prematurely', async () => {
    const wait = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue()
    const numeric = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ReadwiseApiError(429, '99999'))
      .mockResolvedValue('ok')
    await expect(withReadwiseRetry(numeric, wait)).rejects.toMatchObject({ status: 429 })

    const dated = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ReadwiseApiError(429, 'Wed, 21 Oct 2099 07:28:00 GMT'))
      .mockResolvedValue('ok')
    await expect(withReadwiseRetry(dated, wait)).rejects.toMatchObject({ status: 429 })
    expect(wait).not.toHaveBeenCalled()
    expect(numeric).toHaveBeenCalledOnce()
    expect(dated).toHaveBeenCalledOnce()
  })
})
