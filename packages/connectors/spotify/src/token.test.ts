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
