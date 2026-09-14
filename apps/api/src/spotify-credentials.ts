import { refreshSpotifyAccessToken } from '@media-tracker/connector-spotify'
import { D1DatabaseClient, SqlCredentialStore } from '@media-tracker/db'
import type { Bindings } from './env'

function encode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

export async function refreshStoredSpotifyToken(bindings: Bindings, connectionId: string) {
  let key: CryptoKey
  try {
    const bytes = decode(bindings.TOKEN_ENCRYPTION_KEY ?? '')
    if (bytes.length !== 32) throw new Error()
    key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
  } catch {
    throw new Error(
      'Configure TOKEN_ENCRYPTION_KEY as a base64-encoded 32-byte key before Spotify sync',
    )
  }
  const store = new SqlCredentialStore(new D1DatabaseClient(bindings.DB))
  const owner = crypto.randomUUID()
  if (!(await store.acquire(connectionId, owner, Date.now())))
    throw new Error('Spotify token refresh is already running; retry shortly')
  try {
    const bootstrap = bindings.SPOTIFY_REFRESH_TOKEN!.trim()
    const bootstrapSha256 = encode(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bootstrap))),
    )
    const stored = await store.read(connectionId)
    const additionalData = new TextEncoder().encode(connectionId)
    const refreshToken =
      stored?.bootstrapSha256 === bootstrapSha256
        ? new TextDecoder().decode(
            await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: decode(stored.iv), additionalData },
              key,
              decode(stored.ciphertext),
            ),
          )
        : bootstrap
    const result = await refreshSpotifyAccessToken({
      clientId: bindings.SPOTIFY_CLIENT_ID!.trim(),
      refreshToken,
      ...(bindings.SPOTIFY_CLIENT_SECRET === undefined
        ? {}
        : { clientSecret: bindings.SPOTIFY_CLIENT_SECRET }),
    })
    // Persist the replacement before fetching any library pages, even if that scan fails.
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData },
      key,
      new TextEncoder().encode(result.refreshToken ?? refreshToken),
    )
    await store.write(connectionId, {
      bootstrapSha256,
      ciphertext: encode(new Uint8Array(ciphertext)),
      iv: encode(iv),
    })
    return result
  } finally {
    await store.release(connectionId, owner)
  }
}
