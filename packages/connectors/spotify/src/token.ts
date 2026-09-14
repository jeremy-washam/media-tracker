import { z } from 'zod'

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string(),
})

export interface SpotifyRefreshedToken {
  readonly accessToken: string
  readonly expiresInSeconds: number
  readonly refreshToken: string | null
  readonly scope: string | null
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function refreshSpotifyAccessToken(input: {
  clientId: string
  clientSecret?: string
  refreshToken: string
  fetch?: typeof fetch
}): Promise<SpotifyRefreshedToken> {
  const fetcher = input.fetch ?? fetch
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
  })
  if (input.clientSecret === undefined) body.set('client_id', input.clientId)
  else headers.set('Authorization', `Basic ${base64(`${input.clientId}:${input.clientSecret}`)}`)

  const response = await fetcher('https://accounts.spotify.com/api/token', {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers,
    body,
  })
  if (!response.ok) throw new Error(`Spotify token refresh returned ${response.status}`)
  const token = tokenSchema.parse(await response.json())
  return {
    accessToken: token.access_token,
    expiresInSeconds: token.expires_in,
    refreshToken: token.refresh_token ?? null,
    scope: token.scope ?? null,
  }
}
