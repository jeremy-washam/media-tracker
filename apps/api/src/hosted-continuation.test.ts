import { describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import type { Bindings } from './env'
import { continueSpotifyExtendedHistoryImport } from './spotify-import'
import { continueYoutubeTakeoutImport } from './youtube-import'

const importId = 'a'.repeat(64)
const rawObject = (size: number, bytes: Uint8Array) => ({
  size,
  arrayBuffer: vi.fn(async () => bytes.slice().buffer),
})
function env(get: ReturnType<typeof vi.fn>) {
  const prepare = vi.fn(() => {
    throw new Error('Unexpected database write')
  })
  return {
    bindings: { AUTH_MODE: 'access', RAW_BUCKET: { get }, DB: { prepare } } as unknown as Bindings,
    prepare,
  }
}
describe.each(['spotify', 'youtube'] as const)(
  'hosted legacy %s continuation limits',
  (provider) => {
    const proceed =
      provider === 'spotify' ? continueSpotifyExtendedHistoryImport : continueYoutubeTakeoutImport
    it('rejects oversized stored archives before reading or writing', async () => {
      const object = rawObject(26 * 1024 * 1024, new Uint8Array())
      const get = vi.fn(async (key: string) => (key.endsWith('.zip') ? object : null))
      const { bindings, prepare } = env(get)
      await expect(proceed(bindings, importId)).rejects.toThrow('local app import')
      expect(object.arrayBuffer).not.toHaveBeenCalled()
      expect(prepare).not.toHaveBeenCalled()
    })
    it('rejects highly compressed legacy archive expansion before the parser or DB', async () => {
      const bytes = zipSync({ 'history.json': new Uint8Array(9 * 1024 * 1024) })
      const object = rawObject(bytes.length, bytes)
      const { bindings, prepare } = env(
        vi.fn(async (key: string) => (key.endsWith('.zip') ? object : null)),
      )
      await expect(proceed(bindings, importId)).rejects.toThrow('local app import')
      expect(prepare).not.toHaveBeenCalled()
    })
  },
)
it('rejects an oversized Spotify prepared manifest before JSON parsing or DB work', async () => {
  const object = rawObject(9 * 1024 * 1024, strToU8('{}'))
  const { bindings, prepare } = env(vi.fn(async () => object))
  await expect(continueSpotifyExtendedHistoryImport(bindings, importId)).rejects.toThrow(
    'local app import',
  )
  expect(object.arrayBuffer).not.toHaveBeenCalled()
  expect(prepare).not.toHaveBeenCalled()
})
