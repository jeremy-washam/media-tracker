import { ApiErrorSchema } from '@media-tracker/contracts'
import { privateAccessError } from './access'
import type { Bindings } from './env'

// Called only after owner authentication. One key covers all API routes so
// changing a path cannot evade the limiter. Cloudflare counters are per location.
export async function limitApiUsage(
  request: Request,
  env: Pick<Bindings, 'AUTH_MODE' | 'API_RATE_LIMITER' | 'WRITE_RATE_LIMITER'>,
): Promise<Response | null> {
  if (env.AUTH_MODE === 'local') return null
  if (!env.API_RATE_LIMITER || !env.WRITE_RATE_LIMITER)
    return privateAccessError(503, 'Usage protection is not configured.')
  try {
    const api = await env.API_RATE_LIMITER.limit({ key: 'imladris-owner-api' })
    const write = ['GET', 'HEAD', 'OPTIONS'].includes(request.method)
      ? true
      : api.success && (await env.WRITE_RATE_LIMITER.limit({ key: 'imladris-owner-write' })).success
    if (api.success && write) return null
  } catch {
    return privateAccessError(503, 'Usage protection is temporarily unavailable.')
  }
  const requestId = crypto.randomUUID()
  return Response.json(
    ApiErrorSchema.parse({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Wait a minute and try again.',
        requestId,
      },
    }),
    {
      status: 429,
      headers: {
        'retry-after': '60',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-request-id': requestId,
      },
    },
  )
}
