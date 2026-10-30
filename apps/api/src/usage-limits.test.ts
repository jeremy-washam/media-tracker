import { describe, expect, it, vi } from 'vitest'
import { limitApiUsage } from './usage-limits'
import type { Bindings } from './env'

function setup() {
  const api = vi.fn(async () => ({ success: true }))
  const write = vi.fn(async () => ({ success: true }))
  const env: Pick<Bindings, 'AUTH_MODE' | 'API_RATE_LIMITER' | 'WRITE_RATE_LIMITER'> = {
    AUTH_MODE: 'access',
    API_RATE_LIMITER: { limit: api },
    WRITE_RATE_LIMITER: { limit: write },
  }
  return { env, api, write }
}
const request = (method = 'GET', path = '/api/health') =>
  new Request(`https://synthetic.workers.dev${path}`, { method })

describe('authenticated API usage protection', () => {
  it('uses one API counter across paths and avoids the write counter for reads', async () => {
    const { env, api, write } = setup()
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(await limitApiUsage(request(method, `/api/${method}`), env)).toBeNull()
      expect(api).toHaveBeenLastCalledWith({ key: 'imladris-owner-api' })
    }
    expect(write).not.toHaveBeenCalled()
  })
  it('checks both counters for writes', async () => {
    const { env, api, write } = setup()
    expect(await limitApiUsage(request('POST'), env)).toBeNull()
    expect(api).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith({ key: 'imladris-owner-write' })
  })
  it.each(['api', 'write'] as const)(
    'returns a private retryable 429 for a %s limit',
    async (key) => {
      const setupResult = setup()
      setupResult[key].mockResolvedValue({ success: false })
      const response = await limitApiUsage(request('POST'), setupResult.env)
      expect(response?.status).toBe(429)
      expect(response?.headers.get('retry-after')).toBe('60')
      expect(response?.headers.get('cache-control')).toBe('no-store')
      expect(await response?.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } })
      if (key === 'api') expect(setupResult.write).not.toHaveBeenCalled()
    },
  )
  it('allows Stop under the ordinary API limit when the write allowance is exhausted', async () => {
    const { env, write, api } = setup()
    write.mockResolvedValue({ success: false })
    expect(
      await limitApiUsage(
        request(
          'POST',
          `/api/chat/conversations/c_${'a'.repeat(32)}/runs/c_${'a'.repeat(32)}.01K00000000000000000000001/cancel`,
        ),
        env,
      ),
    ).toBeNull()
    expect(api).toHaveBeenCalledOnce()
    expect(write).not.toHaveBeenCalled()
  })
  it('fails closed when protection is missing or unavailable', async () => {
    expect((await limitApiUsage(request(), { AUTH_MODE: 'access' }))?.status).toBe(503)
    const { env, api } = setup()
    api.mockRejectedValue(new Error('synthetic limiter failure'))
    expect((await limitApiUsage(request(), env))?.status).toBe(503)
  })
  it('preserves explicit local development', async () => {
    const { env, api } = setup()
    env.AUTH_MODE = 'local'
    expect(await limitApiUsage(request(), env)).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })
})
