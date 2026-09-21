import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const apiKey = process.env.YOUTUBE_API_KEY?.trim()

if (apiKey === undefined || apiKey.length === 0) {
  console.error(
    'YOUTUBE_API_KEY is not set. Add it to the ignored repository-root .env.local file and rerun this command.',
  )
  process.exitCode = 1
} else {
  try {
    const database = new DatabaseSync(await findLocalDatabase(), { readOnly: true })
    const rows = database
      .prepare("select external_id from external_identities where namespace = 'youtube' limit 50")
      .all() as unknown as { external_id: string }[]
    if (rows.length === 0) throw new Error('The local database has no YouTube identities')

    const videoParameters = new URLSearchParams({
      key: apiKey,
      id: rows.map((row) => row.external_id).join(','),
      part: 'snippet,contentDetails,status,liveStreamingDetails',
    })
    const videos = await requestJson(
      `https://www.googleapis.com/youtube/v3/videos?${videoParameters.toString()}`,
    )
    const videoBody = asRecord(videos.body)
    const videoItems = asRecords(videoBody.items)
    const channelIds = [
      ...new Set(
        videoItems
          .map((item) => asRecord(item.snippet).channelId)
          .filter((value): value is string => typeof value === 'string'),
      ),
    ].slice(0, 50)
    const channelParameters = new URLSearchParams({
      key: apiKey,
      id: channelIds.join(','),
      part: 'snippet,contentDetails,status,statistics,brandingSettings',
    })
    const channels = await requestJson(
      `https://www.googleapis.com/youtube/v3/channels?${channelParameters.toString()}`,
    )
    const channelBody = asRecord(channels.body)
    const channelItems = asRecords(channelBody.items)
    const categoryParameters = new URLSearchParams({
      key: apiKey,
      regionCode: 'US',
      part: 'snippet',
    })
    const categories = await requestJson(
      `https://www.googleapis.com/youtube/v3/videoCategories?${categoryParameters.toString()}`,
    )
    const categoryBody = asRecord(categories.body)
    const categoryItems = asRecords(categoryBody.items)

    console.log(
      JSON.stringify(
        {
          provider: 'youtube-data-api',
          samplePolicy: 'aggregate-only; video and channel identifiers omitted',
          videos: {
            status: videos.status,
            headers: safeHeaders(videos.headers),
            requested: rows.length,
            returned: videoItems.length,
            omitted: rows.length - videoItems.length,
            responseKeys: Object.keys(videoBody).sort(),
            itemKeys: Object.keys(videoItems[0] ?? {}).sort(),
            fieldPresence: fieldPresence(videoItems),
          },
          channels: {
            status: channels.status,
            headers: safeHeaders(channels.headers),
            requested: channelIds.length,
            returned: channelItems.length,
            responseKeys: Object.keys(channelBody).sort(),
            itemKeys: Object.keys(channelItems[0] ?? {}).sort(),
            fieldPresence: fieldPresence(channelItems),
          },
          categories: {
            status: categories.status,
            headers: safeHeaders(categories.headers),
            returned: categoryItems.length,
            itemKeys: Object.keys(categoryItems[0] ?? {}).sort(),
            snippetKeys: Object.keys(asRecord(categoryItems[0]?.snippet)).sort(),
          },
        },
        null,
        2,
      ),
    )
  } catch {
    console.error(
      'YouTube Data API probe failed. Verify the key, API enablement, network access, local migrated database, and imported Takeout data.',
    )
    process.exitCode = 1
  }
}

async function requestJson(url: string) {
  const response = await fetch(url)
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(`YouTube Data API returned ${response.status}`)
  return { status: response.status, headers: response.headers, body }
}

async function findLocalDatabase(): Promise<string> {
  const explicit = process.env.IMLADRIS_LOCAL_DB_PATH?.trim()
  if (explicit !== undefined && explicit.length > 0) return explicit

  const directory = resolve(
    process.env.INIT_CWD ?? process.cwd(),
    'apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
  )
  const candidates = await Promise.all(
    (await readdir(directory))
      .filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
      .map(async (name) => ({
        path: resolve(directory, name),
        size: (await stat(resolve(directory, name))).size,
      })),
  )
  const selected = candidates.sort((left, right) => right.size - left.size)[0]
  if (selected === undefined) throw new Error('No local D1 database found')
  return selected.path
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : []
}

function fieldPresence(items: Record<string, unknown>[]): Record<string, number> {
  const presence: Record<string, number> = {}
  for (const item of items) {
    for (const [part, value] of Object.entries(item)) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
      for (const field of Object.keys(value)) {
        const path = `${part}.${field}`
        presence[path] = (presence[path] ?? 0) + 1
      }
    }
  }
  return presence
}

function safeHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [
      'cache-control',
      'etag',
      'expires',
      'retry-after',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
    ]
      .map((name) => [name, headers.get(name)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  )
}
