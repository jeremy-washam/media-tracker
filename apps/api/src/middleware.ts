import { secureHeaders } from 'hono/secure-headers'
import { routePath } from 'hono/route'

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
  const usage = {
    statements: 0,
    measuredStatements: 0,
    rowsRead: 0,
    rowsWritten: 0,
    elapsedMs: 0,
    failedOperations: 0,
  }
  context.set('databaseUsage', usage)
  context.set('databaseUsageObserver', (event) => {
    usage.statements += event.statementCount
    usage.measuredStatements += event.measuredStatements
    usage.rowsRead += event.rowsRead
    usage.rowsWritten += event.rowsWritten
    usage.elapsedMs += event.elapsedMs
    if (!event.success) usage.failedOperations += 1
  })
  await next()
  context.header('x-request-id', requestId)
}

export const requestLogger: MiddlewareHandler<AppEnv> = async (context, next) => {
  const startedAt = performance.now()

  try {
    await next()
  } finally {
    try {
      console.info(
        JSON.stringify({
          level: 'info',
          event: 'request.completed',
          requestId: context.get('requestId'),
          method: context.req.method,
          path: routePath(context) || 'unmatched',
          status: context.res.status,
          durationMs: Math.round(performance.now() - startedAt),
          databaseUsage: {
            ...context.get('databaseUsage'),
            unmeasuredStatements:
              context.get('databaseUsage').statements -
              context.get('databaseUsage').measuredStatements,
            elapsedMs: Math.round(context.get('databaseUsage').elapsedMs),
          },
        }),
      )
    } catch {
      /* Reporting must not replace request results or errors. */
    }
  }
}
