import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { hostedZipInflatedLimit, preflightHostedZip } from './hosted-zip'

function central(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 0; offset + 46 < bytes.length; offset++)
    if (view.getUint32(offset, true) === 0x02014b50) return offset
  throw new Error('Missing synthetic directory')
}

describe('hosted ZIP decompression boundary', () => {
  it.each([
    ['Letterboxd', { 'diary.csv': strToU8('Date,Name,Year\n2026-10-29,Synthetic Movie,2026\n') }],
    [
      'Spotify',
      {
        'Spotify Extended Streaming History/Streaming_History_Audio_2026.json': strToU8(
          '[{"ts":"2026-10-29T12:00:00Z","ms_played":1000}]',
        ),
      },
    ],
    [
      'YouTube',
      {
        'Takeout/YouTube and YouTube Music/history/watch-history.json': strToU8(
          '[{"title":"Watched Synthetic Video","titleUrl":"https://www.youtube.com/watch?v=abcdefghijk","time":"2026-10-29T12:00:00Z"}]',
        ),
      },
    ],
  ] as const)('accepts a small valid %s export', (_provider, members) => {
    expect(() => preflightHostedZip(zipSync(members))).not.toThrow()
  })
  it('rejects a very small compressed archive whose declared expansion exceeds the hosted ceiling', () => {
    const bytes = zipSync({ 'history.json': new Uint8Array(hostedZipInflatedLimit + 1) })
    expect(bytes.length).toBeLessThan(100_000)
    expect(() => preflightHostedZip(bytes)).toThrow('local app import')
  })
  it('enforces aggregate expansion across individually small members', () => {
    const bytes = zipSync({
      'one.json': new Uint8Array(5 * 1024 * 1024),
      'two.json': new Uint8Array(5 * 1024 * 1024),
    })
    expect(() => preflightHostedZip(bytes)).toThrow('local app import')
  })
  it('independently rejects output that lies about original size in both headers', () => {
    const bytes = zipSync({ 'history.json': new Uint8Array(2 * 1024 * 1024) })
    const view = new DataView(bytes.buffer)
    view.setUint32(22, 1, true)
    view.setUint32(central(bytes) + 24, 1, true)
    expect(() => preflightHostedZip(bytes)).toThrow('local app import')
  })
  it('rejects truncated or inconsistent directory/member metadata', () => {
    const bytes = zipSync({ 'history.json': strToU8('[]') })
    expect(() => preflightHostedZip(bytes.slice(0, -2))).toThrow('local app import')
    const corrupt = bytes.slice()
    new DataView(corrupt.buffer).setUint32(central(corrupt) + 42, corrupt.length, true)
    expect(() => preflightHostedZip(corrupt)).toThrow('local app import')
  })
  it('rejects unsupported encrypted archives and excessive member counts', () => {
    const bytes = zipSync({ 'history.json': strToU8('[]') })
    const view = new DataView(bytes.buffer)
    view.setUint16(6, 1, true)
    view.setUint16(central(bytes) + 8, 1, true)
    expect(() => preflightHostedZip(bytes)).toThrow('local app import')
    const crowded = zipSync(
      Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`entry-${i}`, new Uint8Array()])),
    )
    expect(() => preflightHostedZip(crowded)).toThrow('local app import')
  })
  it('processes a representative near-limit history without accumulating inflated chunks', () => {
    const bytes = zipSync({
      'history.json': strToU8(' '.repeat(hostedZipInflatedLimit - 2) + '[]'),
    })
    expect(() => preflightHostedZip(bytes)).not.toThrow()
  })
})
