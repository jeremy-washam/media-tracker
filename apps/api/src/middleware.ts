import { secureHeaders } from 'hono/secure-headers'

import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from './env'

const acceptedRequestId = /^[A-Za-z0-9._-]{1,128}$/

export const securityHeaders = secureHeaders()

export const requestContext: MiddlewareHandler<AppEnv> = async (context, next) => {
  const suppliedRequestId = context.req.header('x-request-id')
  const requestId =
    suppliedRequestId && acceptedRequestId.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID()

  context.set('requestId', requestId)
  await next()
  context.header('x-request-id', requestId)
}

export const requestLogger: MiddlewareHandler<AppEnv> = async (context, next) => {
  const startedAt = performance.now()

  try {
    await next()
  } finally {
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'request.completed',
        requestId: context.get('requestId'),
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        status: context.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    )
  }
}
