import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const files = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  chmod: vi.fn(),
  mkdir: vi.fn(),
}))
const http = vi.hoisted(() => ({
  handler: undefined as
    | undefined
    | ((
        request: { method: string; url: string },
        response: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
      ) => void),
  events: new Map<string, () => void>(),
  closed: vi.fn(),
}))
vi.mock('node:http', () => ({
  createServer: (handler: NonNullable<typeof http.handler>) => {
    http.handler = handler
    return {
      once(name: string, callback: () => void) {
        http.events.set(name, callback)
        return this
      },
      listen() {
        return this
      },
      close() {
        http.closed()
        http.events.get('close')?.()
      },
    }
  },
}))
vi.mock('node:fs/promises', () => files)
import { createPkcePair, getSpotifyAccessToken } from './oauth'
const input = { clientId: 'synthetic', redirectUri: 'http://127.0.0.1:8769/auth/spotify/callback' }
const cached = {
  accessToken: 'synthetic-access',
  refreshToken: 'synthetic-refresh',
  expiresAt: 4102444800000,
  scope: 'user-library-read user-read-playback-position',
}
beforeEach(() => {
  vi.clearAllMocks()
  http.handler = undefined
  http.events.clear()
  files.readFile.mockResolvedValue(JSON.stringify(cached))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('Spotify local authorization safety', () => {
  it('produces independent S256 PKCE challenges from random verifiers', () => {
    const first = createPkcePair(),
      second = createPkcePair()
    expect(first.verifier).not.toBe(second.verifier)
    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(first.challenge).toBe(createHash('sha256').update(first.verifier).digest('base64url'))
  })
  it.each([
    'https://example.com/auth/spotify/callback',
    'http://localhost:8769/auth/spotify/callback',
    'http://127.0.0.1:8769/other',
    'http://user@127.0.0.1:8769/auth/spotify/callback',
    'http://127.0.0.1:8769/auth/spotify/callback?x=1',
    'http://127.0.0.1:8769/auth/spotify/callback#x',
  ])('rejects unsafe redirect %s before reading credentials', async (redirectUri) => {
    await expect(getSpotifyAccessToken({ ...input, redirectUri })).rejects.toThrow('loopback')
    expect(files.readFile).not.toHaveBeenCalled()
  })
  it('reuses a valid cached grant without provider access', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await getSpotifyAccessToken(input)).toBe(cached.accessToken)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects insufficient scopes on cached grants', async () => {
    files.readFile.mockResolvedValue(JSON.stringify({ ...cached, scope: 'user-library-read' }))
    await expect(getSpotifyAccessToken(input)).rejects.toThrow('user-read-playback-position')
  })
  it('persists rotated credentials atomically with owner-only permissions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          access_token: 'replacement-access',
          refresh_token: 'replacement-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: cached.scope,
        }),
      ),
    )
    expect(await getSpotifyAccessToken({ ...input, forceRefresh: true })).toBe('replacement-access')
    expect(files.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      expect.stringContaining('replacement-refresh'),
      { mode: 0o600 },
    )
    expect(files.rename).toHaveBeenCalledOnce()
    expect(files.chmod).toHaveBeenCalledWith(expect.stringMatching(/spotify-oauth\.json$/), 0o600)
  })
  it('retains prior refresh token when the provider omits a replacement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          access_token: 'replacement',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: cached.scope,
        }),
      ),
    )
    await getSpotifyAccessToken({ ...input, forceRefresh: true })
    expect(files.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('synthetic-refresh'),
      expect.anything(),
    )
  })
})

describe('Spotify loopback callbacks', () => {
  it.each(['wrong-state', 'denied-consent'] as const)(
    'rejects %s before token exchange',
    async (scenario) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      const fetcher = vi.fn()
      vi.stubGlobal('fetch', fetcher)
      const authorization = getSpotifyAccessToken({ ...input, reauthorize: true })
      const rejected = expect(authorization).rejects.toThrow(
        scenario === 'wrong-state' ? 'valid code and state' : 'authorization failed',
      )
      await vi.waitFor(() => expect(http.handler).toBeDefined())
      const authorizationUrl = new URL(log.mock.calls[1]![0] as string)
      const parameters = new URLSearchParams({
        state:
          scenario === 'wrong-state' ? 'incorrect' : authorizationUrl.searchParams.get('state')!,
      })
      parameters.set(
        scenario === 'wrong-state' ? 'code' : 'error',
        scenario === 'wrong-state' ? 'synthetic-code' : 'access_denied',
      )
      const response = { writeHead: vi.fn(), end: vi.fn() }
      http.handler!({ method: 'GET', url: `/auth/spotify/callback?${parameters}` }, response)
      await rejected
      expect(response.writeHead).toHaveBeenCalledWith(400, expect.anything())
      expect(fetcher).not.toHaveBeenCalled()
      expect(http.closed).toHaveBeenCalled()
    },
  )
  it('exchanges only the state-verified code with its original PKCE verifier', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body))
      expect(body.get('code')).toBe('synthetic-code')
      expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(
        authorizationUrl.searchParams.get('code_challenge'),
      )
      return Response.json({
        access_token: 'authorized',
        refresh_token: 'refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: cached.scope,
      })
    })
    vi.stubGlobal('fetch', fetcher)
    const authorization = getSpotifyAccessToken({ ...input, reauthorize: true })
    await vi.waitFor(() => expect(http.handler).toBeDefined())
    const authorizationUrl = new URL(log.mock.calls[1]![0] as string)
    const response = { writeHead: vi.fn(), end: vi.fn() }
    http.handler!(
      {
        method: 'GET',
        url: `/auth/spotify/callback?state=${authorizationUrl.searchParams.get('state')}&code=synthetic-code`,
      },
      response,
    )
    expect(await authorization).toBe('authorized')
    expect(files.rename).toHaveBeenCalledOnce()
  })
})
