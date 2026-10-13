import { createRemoteJWKSet, jwtVerify } from 'jose'
import { ApiErrorSchema } from '@media-tracker/contracts'
import type { Bindings } from './env'

type AccessBindings = Pick<
  Bindings,
  'AUTH_MODE' | 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD' | 'OWNER_EMAIL'
>

// Cache only public signing keys. No request identity or credential is retained.
let signingKeys: { issuer: string; resolver: ReturnType<typeof createRemoteJWKSet> } | undefined

export function privateAccessError(status: 401 | 403 | 503, message: string): Response {
  const requestId = crypto.randomUUID()
  return Response.json(
    ApiErrorSchema.parse({
      error: {
        code:
          status === 503 ? 'SERVICE_UNAVAILABLE' : status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED',
        message,
        requestId,
      },
    }),
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-request-id': requestId,
        'x-content-type-options': 'nosniff',
      },
    },
  )
}

export async function authorizeRequest(
  request: Request,
  env: AccessBindings,
): Promise<Response | null> {
  const hostname = new URL(request.url).hostname
  if (env.AUTH_MODE === 'local' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname))
    return null

  let issuer: URL
  try {
    issuer = new URL(env.ACCESS_TEAM_DOMAIN ?? '')
    if (
      issuer.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(issuer.hostname) ||
      issuer.username ||
      issuer.password ||
      issuer.port ||
      issuer.pathname !== '/' ||
      issuer.search ||
      issuer.hash ||
      !env.ACCESS_AUD?.trim() ||
      !env.OWNER_EMAIL?.trim()
    )
      throw new Error('Invalid Access configuration')
  } catch {
    return privateAccessError(503, 'Private access is not configured.')
  }

  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token || token.length > 16_384) return privateAccessError(401, 'Sign in to access Imladris.')
  try {
    if (signingKeys?.issuer !== issuer.origin)
      signingKeys = {
        issuer: issuer.origin,
        resolver: createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), {
          timeoutDuration: 5_000,
        }),
      }
    const { payload } = await jwtVerify(token, signingKeys.resolver, {
      issuer: issuer.origin,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'],
    })
    if (
      typeof payload.email !== 'string' ||
      payload.email.toLowerCase() !== env.OWNER_EMAIL!.trim().toLowerCase() ||
      payload.type !== 'app'
    )
      return privateAccessError(403, 'This account cannot access Imladris.')
    return null
  } catch {
    return privateAccessError(401, 'Sign in to access Imladris.')
  }
}
