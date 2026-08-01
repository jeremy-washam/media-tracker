import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

const spotifyTokenUrl = 'https://accounts.spotify.com/api/token'
const tokenFile = fileURLToPath(new URL('../../../../.private/spotify-oauth.json', import.meta.url))
const requiredScopes = ['user-library-read', 'user-read-playback-position'] as const

const storedTokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
  refreshToken: z.string().min(1),
  scope: z.string(),
})

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string(),
  token_type: z.string(),
})

interface StoredToken {
  accessToken: string
  expiresAt: number
  refreshToken: string
  scope: string
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

export function createPkcePair(): { challenge: string; verifier: string } {
  const verifier = base64Url(randomBytes(64))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { challenge, verifier }
}

function equalState(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function validateRedirectUri(value: string): URL {
  const redirectUri = new URL(value)
  if (
    redirectUri.protocol !== 'http:' ||
    redirectUri.hostname !== '127.0.0.1' ||
    redirectUri.pathname !== '/auth/spotify/callback' ||
    redirectUri.username.length > 0 ||
    redirectUri.password.length > 0 ||
    redirectUri.search.length > 0 ||
    redirectUri.hash.length > 0
  ) {
    throw new Error(
      'SPOTIFY_REDIRECT_URI must be a plain HTTP loopback URL ending in /auth/spotify/callback',
    )
  }
  return redirectUri
}

async function readStoredToken(): Promise<StoredToken | null> {
  try {
    return storedTokenSchema.parse(JSON.parse(await readFile(tokenFile, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error('The local Spotify token file is invalid; remove it and reauthorize', {
      cause: error,
    })
  }
}

async function writeStoredToken(token: StoredToken): Promise<void> {
  const directory = dirname(tokenFile)
  const temporaryFile = `${tokenFile}.${process.pid}.tmp`
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  await writeFile(temporaryFile, `${JSON.stringify(token)}\n`, { mode: 0o600 })
  await rename(temporaryFile, tokenFile)
  await chmod(tokenFile, 0o600)
}

async function requestToken(
  body: URLSearchParams,
  previousRefreshToken: string | undefined,
): Promise<StoredToken> {
  const response = await fetch(spotifyTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) throw new Error(`Spotify token exchange returned ${response.status}`)

  const token = tokenResponseSchema.parse(await response.json())
  const refreshToken = token.refresh_token ?? previousRefreshToken
  if (refreshToken === undefined) throw new Error('Spotify did not return a refresh token')

  const stored = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    refreshToken,
    scope: token.scope,
  }
  await writeStoredToken(stored)
  return stored
}

async function waitForAuthorizationCode(redirectUri: URL, expectedState: string): Promise<string> {
  const port = redirectUri.port.length === 0 ? 80 : Number(redirectUri.port)

  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', redirectUri.origin)
      if (request.method !== 'GET' || requestUrl.pathname !== redirectUri.pathname) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Not found')
        return
      }

      const state = requestUrl.searchParams.get('state')
      const code = requestUrl.searchParams.get('code')
      const oauthError = requestUrl.searchParams.get('error')
      if (oauthError !== null) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Spotify authorization was declined. You can close this tab.')
        server.close()
        reject(new Error(`Spotify authorization failed: ${oauthError}`))
        return
      }
      if (state === null || !equalState(state, expectedState) || code === null) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Invalid Spotify authorization response. You can close this tab.')
        server.close()
        reject(new Error('Spotify callback did not contain a valid code and state'))
        return
      }

      response.writeHead(200, {
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'Content-Type': 'text/html; charset=utf-8',
      })
      response.end(
        '<!doctype html><title>Spotify connected</title><p>Spotify is connected. You can close this tab and return to Codex.</p>',
      )
      server.close()
      resolve(code)
    })

    const timeout = setTimeout(
      () => {
        server.close()
        reject(new Error('Spotify authorization timed out after five minutes'))
      },
      5 * 60 * 1000,
    )
    timeout.unref()

    server.once('close', () => clearTimeout(timeout))
    server.once('error', reject)
    server.listen(port, redirectUri.hostname)
  })
}

async function authorize(clientId: string, redirectUri: URL): Promise<StoredToken> {
  const { challenge, verifier } = createPkcePair()
  const state = base64Url(randomBytes(32))
  const authorizeUrl = new URL('https://accounts.spotify.com/authorize')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri.toString())
  authorizeUrl.searchParams.set('scope', requiredScopes.join(' '))
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('state', state)

  const codePromise = waitForAuthorizationCode(redirectUri, state)
  console.log('Open this Spotify authorization URL in your browser:')
  console.log(authorizeUrl.toString())
  const code = await codePromise

  return requestToken(
    new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri.toString(),
    }),
    undefined,
  )
}

async function refresh(clientId: string, token: StoredToken): Promise<StoredToken> {
  return requestToken(
    new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    }),
    token.refreshToken,
  )
}

function assertScopes(scope: string): void {
  const granted = new Set(scope.split(' '))
  const missing = requiredScopes.filter((required) => !granted.has(required))
  if (missing.length > 0)
    throw new Error(`Spotify did not grant required scopes: ${missing.join(', ')}`)
}

export async function getSpotifyAccessToken(input: {
  clientId: string
  forceRefresh?: boolean
  reauthorize?: boolean
  redirectUri: string
}): Promise<string> {
  const redirectUri = validateRedirectUri(input.redirectUri)
  let token = input.reauthorize === true ? null : await readStoredToken()

  if (token === null) {
    token = await authorize(input.clientId, redirectUri)
  } else if (input.forceRefresh === true || token.expiresAt <= Date.now() + 60_000) {
    token = await refresh(input.clientId, token)
  }

  assertScopes(token.scope)
  return token.accessToken
}
