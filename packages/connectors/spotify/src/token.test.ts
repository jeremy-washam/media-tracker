import { describe, expect, it, vi } from 'vitest'

import { refreshSpotifyAccessToken } from './token.ts'

describe('Spotify token refresh', () => {
  it('refreshes a PKCE grant without exposing credentials in the URL', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe('https://accounts.spotify.com/api/token')
      expect(String(init?.body)).toContain('refresh_token=refresh-secret')
      expect(String(init?.body)).toContain('client_id=client-id')
      return Response.json({
        access_token: 'access-secret',
        expires_in: 3600,
        scope: 'user-library-read user-read-playback-position',
        token_type: 'Bearer',
      })
    })

    await expect(
      refreshSpotifyAccessToken({
        clientId: 'client-id',
        refreshToken: 'refresh-secret',
        fetch: fetcher,
      }),
    ).resolves.toMatchObject({
      accessToken: 'access-secret',
      expiresInSeconds: 3600,
      refreshToken: null,
    })
  })
})

describe('Spotify refresh error boundaries', () => {
  it('uses Basic authorization for confidential clients and preserves replacement credentials', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).not.toContain('secret')
      expect(new Headers(init?.headers).get('authorization')).toBe(
        `Basic ${btoa('client-id:client-secret')}`,
      )
      const body = new URLSearchParams(String(init?.body))
      expect(body.has('client_id')).toBe(false)
      expect(body.get('refresh_token')).toBe('refresh +/& secret')
      return Response.json({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 60,
        token_type: 'Bearer',
      })
    })
    expect(
      await refreshSpotifyAccessToken({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        refreshToken: 'refresh +/& secret',
        fetch: fetcher,
      }),
    ).toMatchObject({ refreshToken: 'new-refresh', accessToken: 'new-access' })
  })
  it.each([400, 401, 429, 503])('returns safe token exchange HTTP %s errors', async (status) => {
    await expect(
      refreshSpotifyAccessToken({
        clientId: 'synthetic',
        refreshToken: 'refresh-secret',
        fetch: async () => new Response('refresh-secret private response', { status }),
      }),
    ).rejects.toThrow(`Spotify token refresh returned ${status}`)
  })
  it.each([
    { access_token: '', expires_in: 3600, token_type: 'Bearer' },
    { access_token: 'synthetic', expires_in: -1, token_type: 'Bearer' },
    { access_token: 'synthetic', expires_in: 3600 },
  ])('rejects invalid refreshed credentials: %j', async (body) => {
    await expect(
      refreshSpotifyAccessToken({
        clientId: 'synthetic',
        refreshToken: 'synthetic',
        fetch: async () => Response.json(body),
      }),
    ).rejects.toThrow()
  })
})
