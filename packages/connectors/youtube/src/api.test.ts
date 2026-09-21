import { describe, expect, it, vi } from 'vitest'

import { YoutubeApiError, YoutubeDataApiClient, youtubeDurationMilliseconds } from './api'

describe('YoutubeDataApiClient', () => {
  it('parses exact batches and durations', async () => {
    const request = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('key')).toBe('secret')
      return Response.json({
        items: [
          {
            id: 'video-1',
            etag: 'etag',
            snippet: {
              publishedAt: '2020-01-01T00:00:00Z',
              channelId: 'channel-1',
              title: 'Video',
              description: '',
              thumbnails: {},
              channelTitle: 'Channel',
              categoryId: '1',
              liveBroadcastContent: 'none',
            },
            contentDetails: {
              duration: 'PT1H2M3.5S',
              definition: 'hd',
              caption: 'true',
              projection: 'rectangular',
            },
            status: {
              uploadStatus: 'processed',
              privacyStatus: 'public',
              embeddable: true,
              madeForKids: false,
            },
          },
        ],
      })
    })
    await expect(
      new YoutubeDataApiClient('secret', request as typeof fetch).videos(['video-1']),
    ).resolves.toHaveLength(1)
    expect(youtubeDurationMilliseconds('PT1H2M3.5S')).toBe(3_723_500)
    expect(youtubeDurationMilliseconds('invalid')).toBeNull()
  })

  it('enforces provider batch bounds', async () => {
    await expect(new YoutubeDataApiClient('secret').videos([])).rejects.toBeInstanceOf(RangeError)
    await expect(
      new YoutubeDataApiClient('secret').videos(
        Array.from({ length: 51 }, (_, index) => String(index)),
      ),
    ).rejects.toBeInstanceOf(RangeError)
  })

  it('classifies transient errors', async () => {
    const request = vi.fn(async () => new Response('{}', { status: 503 }))
    await expect(
      new YoutubeDataApiClient('secret', request as typeof fetch).categories(),
    ).rejects.toMatchObject({ status: 503, retryable: true } satisfies Partial<YoutubeApiError>)
  })

  it('classifies request timeouts as retryable', async () => {
    const request = vi.fn(async () => {
      throw new DOMException('timed out', 'AbortError')
    })
    await expect(
      new YoutubeDataApiClient('secret', request as typeof fetch).categories(),
    ).rejects.toMatchObject({ status: 408, retryable: true } satisfies Partial<YoutubeApiError>)
  })
})
