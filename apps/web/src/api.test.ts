import { describe, expect, it, vi } from 'vitest'

import { fetchHealth } from './api'

const validHealthResponse = {
  status: 'ok',
  service: 'media-tracker-api',
  version: '0.0.0',
  timestamp: '2026-07-18T12:00:00.000Z',
  requestId: 'request-1',
}

describe('API client', () => {
  it('validates successful health responses', async () => {
    const fetcher = vi.fn(async () => Response.json(validHealthResponse)) as unknown as typeof fetch

    await expect(fetchHealth(fetcher)).resolves.toEqual(validHealthResponse)
  })

  it('rejects malformed health responses', async () => {
    const fetcher = vi.fn(async () => Response.json({ status: 'maybe' })) as unknown as typeof fetch

    await expect(fetchHealth(fetcher)).rejects.toThrow()
  })
})
