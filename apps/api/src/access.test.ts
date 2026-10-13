import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { authorizeRequest } from './access'
import worker from './index'
import type { Bindings } from './env'

const issuer = 'https://synthetic-team.cloudflareaccess.com'
const config = {
  AUTH_MODE: 'access',
  ACCESS_TEAM_DOMAIN: issuer,
  ACCESS_AUD: 'synthetic-app',
  OWNER_EMAIL: 'owner@example.com',
}
let keys: Awaited<ReturnType<typeof generateKeyPair>>

beforeAll(async () => {
  keys = await generateKeyPair('RS256')
  const publicKey = { ...(await exportJWK(keys.publicKey)), kid: 'synthetic', alg: 'RS256' }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ keys: [publicKey] })),
  )
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => vi.unstubAllGlobals())

async function token(
  options: {
    email?: string
    audience?: string
    issuer?: string
    expired?: boolean
    type?: string
  } = {},
) {
  return new SignJWT({ email: options.email ?? 'owner@example.com', type: options.type ?? 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic' })
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? 'synthetic-app')
    .setSubject('synthetic-owner')
    .setIssuedAt()
    .setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 60 : '5m')
    .sign(keys.privateKey)
}
function request(jwt?: string, path = '/api/health') {
  return new Request(`https://synthetic.workers.dev${path}`, {
    headers: jwt ? { 'cf-access-jwt-assertion': jwt } : {},
  })
}

describe('private Worker access', () => {
  it('allows a signed, current token for the configured owner', async () => {
    expect(await authorizeRequest(request(await token()), config)).toBeNull()
  })
  it('rejects missing tokens and spoofed identity headers', async () => {
    expect(
      (
        await authorizeRequest(
          new Request('https://synthetic.workers.dev', {
            headers: { 'cf-access-authenticated-user-email': config.OWNER_EMAIL },
          }),
          config,
        )
      )?.status,
    ).toBe(401)
  })
  it.each([
    { audience: 'another-app' },
    { issuer: 'https://another-team.cloudflareaccess.com' },
    { expired: true },
  ])('rejects invalid claims: %j', async (options) => {
    expect((await authorizeRequest(request(await token(options)), config))?.status).toBe(401)
  })
  it.each([{ email: 'someone@example.com' }, { type: 'service' }])(
    'rejects another identity: %j',
    async (options) => {
      expect((await authorizeRequest(request(await token(options)), config))?.status).toBe(403)
    },
  )
  it('rejects a forged signature', async () => {
    const other = await generateKeyPair('RS256')
    const forged = await new SignJWT({ email: config.OWNER_EMAIL, type: 'app' })
      .setProtectedHeader({ alg: 'RS256', kid: 'synthetic' })
      .setIssuer(issuer)
      .setAudience(config.ACCESS_AUD)
      .setSubject('owner')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(other.privateKey)
    expect((await authorizeRequest(request(forged), config))?.status).toBe(401)
  })
  it('fails closed when configuration is missing or an issuer is unsafe', async () => {
    expect((await authorizeRequest(request(), {}))?.status).toBe(503)
    for (const unsafe of [
      'http://localhost',
      'https://example.com',
      `${issuer}/other`,
      `${issuer}?other=1`,
    ])
      expect(
        (await authorizeRequest(request(), { ...config, ACCESS_TEAM_DOMAIN: unsafe }))?.status,
      ).toBe(503)
  })
  it('limits the explicit development bypass to loopback hostnames', async () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]'])
      expect(
        await authorizeRequest(new Request(`http://${host}/api/health`), { AUTH_MODE: 'local' }),
      ).toBeNull()
    expect((await authorizeRequest(request(), { AUTH_MODE: 'local' }))?.status).toBe(503)
    expect((await authorizeRequest(new Request('http://localhost'), {}))?.status).toBe(503)
  })
  it('protects assets, SPA routes and API requests before Hono or bindings run', async () => {
    const assets = vi.fn(() => new Response('synthetic asset'))
    const env = { ...config, ASSETS: { fetch: assets } } as unknown as Bindings
    for (const path of ['/', '/library/books/archive', '/assets/app.js', '/api/health']) {
      expect(
        (await worker.fetch(request(undefined, path), env, {} as ExecutionContext)).status,
      ).toBe(401)
    }
    expect(assets).not.toHaveBeenCalled()
    expect(
      (await worker.fetch(request(await token(), '/assets/app.js'), env, {} as ExecutionContext))
        .status,
    ).toBe(200)
    expect(assets).toHaveBeenCalledOnce()
  })
  it('allows authenticated browsing but blocks writes during cutover', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const env = { ...config, SYNC_ENABLED: 'false' } as Bindings
    env.API_RATE_LIMITER = { limit: vi.fn(async () => ({ success: true })) }
    env.WRITE_RATE_LIMITER = { limit: vi.fn(async () => ({ success: true })) }
    const jwt = await token()
    expect((await worker.fetch(request(jwt), env, {} as ExecutionContext)).status).toBe(200)
    const response = await worker.fetch(
      new Request('https://synthetic.workers.dev/api/connections/readwise/sync', {
        method: 'POST',
        headers: { 'cf-access-jwt-assertion': jwt },
      }),
      env,
      {} as ExecutionContext,
    )
    expect(response.status).toBe(503)
  })
  it('does not start scheduled or queue work while sync is disabled', async () => {
    const context = { waitUntil: vi.fn() } as unknown as ExecutionContext
    const env = { SYNC_ENABLED: 'false' } as Bindings
    worker.scheduled({} as ScheduledController, env, context)
    expect(context.waitUntil).not.toHaveBeenCalled()
    const batch = { retryAll: vi.fn() } as unknown as MessageBatch<never>
    await worker.queue(batch, env)
    expect(batch.retryAll).toHaveBeenCalledWith({ delaySeconds: 300 })
  })
  it('applies API limits after authentication and before route work', async () => {
    const limit = vi.fn(async () => ({ success: false }))
    const env = { ...config } as Bindings
    env.API_RATE_LIMITER = { limit }
    env.WRITE_RATE_LIMITER = { limit }
    expect((await worker.fetch(request(), env, {} as ExecutionContext)).status).toBe(401)
    expect(limit).not.toHaveBeenCalled()
    expect((await worker.fetch(request(await token()), env, {} as ExecutionContext)).status).toBe(
      429,
    )
    expect(limit).toHaveBeenCalledOnce()
  })
})
